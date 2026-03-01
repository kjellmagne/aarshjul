import { WheelRole, type User } from "@prisma/client";
import { NextResponse } from "next/server";

import { isBootstrapAdminEmail, isBootstrapSystemAdminEmail } from "@/lib/admin";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureDefaultTenant } from "@/lib/tenant";

export type AuthContext = {
  userId: string;
  email: string | null;
  groups: string[];
  isAdmin: boolean;
  isSystemAdmin: boolean;
  activeTenantId: string | null;
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

export async function getAuthContext(): Promise<AuthContext | NextResponse> {
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
    activeTenantId: session.user.activeTenantId ?? null
  };
}

export async function getOrCreateUserFromContext(context: AuthContext): Promise<User> {
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
