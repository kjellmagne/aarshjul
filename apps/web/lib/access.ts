import { ApiKeyScope, WheelRole, type User } from "@prisma/client";
import { NextResponse } from "next/server";

import { hashApiKey } from "@/lib/api-keys";
import { isBootstrapAdminEmail, isBootstrapSystemAdminEmail } from "@/lib/admin";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureDefaultTenant } from "@/lib/tenant";

export type ApiKeyPrincipal = {
  id: string;
  scope: ApiKeyScope;
  tenantId: string | null;
  name: string;
  createdById: string | null;
  createdByEmail: string | null;
  createdByIsAdmin: boolean;
  createdByIsSystemAdmin: boolean;
};

export type AuthContext = {
  userId: string;
  email: string | null;
  groups: string[];
  isAdmin: boolean;
  isSystemAdmin: boolean;
  activeTenantId: string | null;
  authMethod: "SESSION" | "API_KEY";
  apiKey: ApiKeyPrincipal | null;
};

function allowedRoles(requiredRole: WheelRole): WheelRole[] {
  if (requiredRole === WheelRole.OWNER) {
    return [WheelRole.OWNER];
  }
  if (requiredRole === WheelRole.EDITOR) {
    return [WheelRole.EDITOR, WheelRole.OWNER];
  }
  return [WheelRole.VIEWER, WheelRole.EDITOR, WheelRole.OWNER];
}

function readRequestApiKey(request: Request): string | null {
  const rawHeaderKey = request.headers.get("x-api-key")?.trim();
  if (rawHeaderKey) {
    return rawHeaderKey;
  }
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  if (!authorization) {
    return null;
  }
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) {
    return null;
  }
  return match[1].trim() || null;
}

export async function getApiKeyPrincipalFromRequest(
  request: Request,
  params?: { requiredScope?: ApiKeyScope }
): Promise<ApiKeyPrincipal | NextResponse | null> {
  const rawKey = readRequestApiKey(request);
  if (!rawKey) {
    return null;
  }

  const hashedKey = hashApiKey(rawKey);
  const now = new Date();
  const apiKey = await prisma.apiKey.findFirst({
    where: {
      secretHash: hashedKey,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
    },
    select: {
      id: true,
      scope: true,
      tenantId: true,
      name: true,
      createdById: true,
      createdBy: {
        select: {
          email: true,
          isAdmin: true,
          isSystemAdmin: true
        }
      }
    }
  });

  if (!apiKey) {
    return NextResponse.json({ error: "Invalid or expired API key." }, { status: 401 });
  }

  if (params?.requiredScope && apiKey.scope !== params.requiredScope) {
    return NextResponse.json({ error: "API key scope does not match this endpoint." }, { status: 403 });
  }

  await prisma.apiKey
    .update({
      where: { id: apiKey.id },
      data: { lastUsedAt: now }
    })
    .catch(() => null);

  return {
    id: apiKey.id,
    scope: apiKey.scope,
    tenantId: apiKey.tenantId,
    name: apiKey.name,
    createdById: apiKey.createdById,
    createdByEmail: apiKey.createdBy?.email ?? null,
    createdByIsAdmin: Boolean(apiKey.createdBy?.isAdmin),
    createdByIsSystemAdmin: Boolean(apiKey.createdBy?.isSystemAdmin)
  };
}

export async function getAuthContext(request?: Request): Promise<AuthContext | NextResponse> {
  if (request) {
    const apiKeyPrincipal = await getApiKeyPrincipalFromRequest(request);
    if (apiKeyPrincipal instanceof NextResponse) {
      return apiKeyPrincipal;
    }
    if (apiKeyPrincipal) {
      return {
        userId: apiKeyPrincipal.createdById ?? "",
        email: apiKeyPrincipal.createdByEmail,
        groups: [],
        isAdmin:
          apiKeyPrincipal.scope === ApiKeyScope.TENANT ||
          apiKeyPrincipal.createdByIsAdmin ||
          apiKeyPrincipal.createdByIsSystemAdmin,
        isSystemAdmin: apiKeyPrincipal.scope === ApiKeyScope.SYSTEM || apiKeyPrincipal.createdByIsSystemAdmin,
        activeTenantId: apiKeyPrincipal.scope === ApiKeyScope.TENANT ? apiKeyPrincipal.tenantId : null,
        authMethod: "API_KEY",
        apiKey: apiKeyPrincipal
      };
    }
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return {
    userId: session.user.id,
    email: session.user.email ?? null,
    groups: session.user.groups ?? [],
    isAdmin: Boolean(session.user.isAdmin),
    isSystemAdmin: Boolean(session.user.isSystemAdmin),
    activeTenantId: session.user.activeTenantId ?? null,
    authMethod: "SESSION",
    apiKey: null
  };
}

export async function getOrCreateUserFromContext(context: AuthContext): Promise<User> {
  if (context.authMethod === "API_KEY") {
    const createdById = context.apiKey?.createdById ?? null;
    if (!createdById) {
      throw new Error("API key is not bound to an active user.");
    }

    const existingUser = await prisma.user.findUnique({
      where: { id: createdById }
    });
    if (!existingUser) {
      throw new Error("API key creator account does not exist.");
    }
    return existingUser;
  }

  if (!context.email) {
    throw new Error("Signed-in user is missing email claim.");
  }

  const user = await prisma.user.upsert({
    where: { email: context.email },
    update: {},
    create: {
      id: context.userId,
      email: context.email
    }
  });

  const setAdmin = !user.isAdmin && isBootstrapAdminEmail(context.email);
  const setSystemAdmin = !user.isSystemAdmin && isBootstrapSystemAdminEmail(context.email);

  if (setAdmin || setSystemAdmin) {
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(setAdmin ? { isAdmin: true } : {}),
        ...(setSystemAdmin ? { isSystemAdmin: true } : {})
      }
    });
    await ensureUserHasAnyTenantMembership(updated.id, updated.isSystemAdmin);
    return updated;
  }

  await ensureUserHasAnyTenantMembership(user.id, user.isSystemAdmin);
  return user;
}

async function ensureUserHasAnyTenantMembership(userId: string, isSystemAdmin: boolean) {
  if (isSystemAdmin) {
    return null;
  }

  const membership = await prisma.tenantMembership.findFirst({
    where: {
      userId,
      isDisabled: false
    },
    select: { tenantId: true }
  });
  if (membership) {
    return membership.tenantId;
  }

  const hasDisabledMembership = await prisma.tenantMembership.findFirst({
    where: { userId },
    select: { id: true }
  });
  if (hasDisabledMembership) {
    return null;
  }

  const defaultTenant = await ensureDefaultTenant();
  await prisma.tenantMembership.upsert({
    where: {
      tenantId_userId: {
        tenantId: defaultTenant.id,
        userId
      }
    },
    update: {},
    create: {
      tenantId: defaultTenant.id,
      userId,
      isDisabled: false
    }
  });
  return defaultTenant.id;
}

export async function assertActiveTenantAccess(params: {
  context: AuthContext;
  userId: string;
}): Promise<string | NextResponse> {
  if (params.context.authMethod === "API_KEY") {
    if (params.context.apiKey?.scope !== ApiKeyScope.TENANT || !params.context.apiKey.tenantId) {
      return NextResponse.json({ error: "Tenant-scoped API key is required." }, { status: 403 });
    }
    return params.context.apiKey.tenantId;
  }

  const activeTenantId = params.context.activeTenantId?.trim() || null;
  if (!activeTenantId) {
    return NextResponse.json({ error: "No active tenant selected." }, { status: 400 });
  }

  const membership = await prisma.tenantMembership.findFirst({
    where: {
      userId: params.userId,
      tenantId: activeTenantId,
      isDisabled: false
    },
    select: { tenantId: true }
  });

  if (!membership) {
    return NextResponse.json({ error: "Forbidden for active tenant." }, { status: 403 });
  }

  return membership.tenantId;
}

export async function assertAdminContext(context: AuthContext): Promise<User | NextResponse> {
  const dbUser = await getOrCreateUserFromContext(context);
  if (!dbUser.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return dbUser;
}

export async function assertSystemAdminContext(context: AuthContext): Promise<User | NextResponse> {
  const dbUser = await getOrCreateUserFromContext(context);
  if (!dbUser.isSystemAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return dbUser;
}

export async function assertWheelAccess(params: {
  wheelId: string;
  context: AuthContext;
  requiredRole?: WheelRole;
}) {
  const { wheelId, context, requiredRole = WheelRole.VIEWER } = params;
  if (context.authMethod === "API_KEY") {
    const tenantId = context.apiKey?.scope === ApiKeyScope.TENANT ? context.apiKey.tenantId : null;
    if (!tenantId) {
      return null;
    }
    return prisma.wheel.findFirst({
      where: {
        id: wheelId,
        tenantId
      },
      select: { id: true, ownerId: true, tenantId: true }
    });
  }

  if (!context.activeTenantId) {
    return null;
  }
  const hasMembership = await prisma.tenantMembership.findFirst({
    where: {
      tenantId: context.activeTenantId,
      userId: context.userId,
      isDisabled: false
    },
    select: { id: true }
  });
  if (!hasMembership) {
    return null;
  }
  const acceptedRoles = allowedRoles(requiredRole);

  const wheel = await prisma.wheel.findFirst({
    where: {
      id: wheelId,
      tenantId: context.activeTenantId,
      OR: [
        { ownerId: context.userId },
        {
          shares: {
            some: {
              targetType: "USER",
              userId: context.userId,
              role: { in: acceptedRoles }
            }
          }
        },
        {
          shares: {
            some: {
              targetType: "AAD_GROUP",
              role: { in: acceptedRoles },
              group: {
                tenantGroupId: { in: context.groups.length > 0 ? context.groups : ["__none__"] }
              }
            }
          }
        }
      ]
    },
    select: { id: true, ownerId: true, tenantId: true }
  });

  return wheel;
}
