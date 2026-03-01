import { TenantRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { assertAdminContext, getAuthContext } from "@/lib/access";
import { prisma } from "@/lib/prisma";

type TenantSettingsRow = {
  id: string;
  name: string;
  supportEmail: string | null;
  timezone: string;
  defaultLanguage: string;
  allowLocalAuth: boolean;
  allowAzureAuth: boolean;
  azureTenantId: string | null;
  azureClientId: string | null;
  azureClientSecret: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean;
  smtpUser: string | null;
  smtpPass: string | null;
  smtpFrom: string | null;
  smtpReplyTo: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function normalizeEmail(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  return normalized.includes("@") ? normalized : null;
}

function mapTenantSettings(tenant: TenantSettingsRow) {
  return {
    id: tenant.id,
    tenantName: tenant.name,
    supportEmail: tenant.supportEmail,
    timezone: tenant.timezone,
    defaultLanguage: tenant.defaultLanguage === "en" ? "en" : "nb",
    allowLocalAuth: tenant.allowLocalAuth,
    allowAzureAuth: tenant.allowAzureAuth,
    azureTenantId: tenant.azureTenantId,
    azureClientId: tenant.azureClientId,
    azureClientSecret: tenant.azureClientSecret,
    smtpHost: tenant.smtpHost,
    smtpPort: tenant.smtpPort,
    smtpSecure: tenant.smtpSecure,
    smtpUser: tenant.smtpUser,
    smtpPass: tenant.smtpPass,
    smtpFrom: tenant.smtpFrom,
    smtpReplyTo: tenant.smtpReplyTo,
    smtpConfigured: Boolean(tenant.smtpHost && tenant.smtpPort && tenant.smtpFrom),
    azureConfigured: Boolean(tenant.azureTenantId && tenant.azureClientId && tenant.azureClientSecret),
    createdAt: tenant.createdAt,
    updatedAt: tenant.updatedAt,
    updatedBy: null
  };
}

async function resolveTenantForAdmin(params: { userId: string; tenantId: string | null; activeTenantId: string | null }) {
  const select = {
    id: true,
    name: true,
    supportEmail: true,
    timezone: true,
    defaultLanguage: true,
    allowLocalAuth: true,
    allowAzureAuth: true,
    azureTenantId: true,
    azureClientId: true,
    azureClientSecret: true,
    smtpHost: true,
    smtpPort: true,
    smtpSecure: true,
    smtpUser: true,
    smtpPass: true,
    smtpFrom: true,
    smtpReplyTo: true,
    createdAt: true,
    updatedAt: true
  } as const;

  const preferredTenantId = params.tenantId || params.activeTenantId;
  if (preferredTenantId) {
    const membership = await prisma.tenantMembership.findFirst({
      where: {
        userId: params.userId,
        role: TenantRole.ADMIN,
        tenantId: preferredTenantId,
        isDisabled: false
      },
      select: {
        tenant: {
          select
        }
      }
    });
    return membership?.tenant ?? null;
  }

  const membership = await prisma.tenantMembership.findFirst({
    where: {
      userId: params.userId,
      role: TenantRole.ADMIN,
      isDisabled: false
    },
    orderBy: [{ createdAt: "asc" }],
    select: {
      tenant: {
        select
      }
    }
  });
  return membership?.tenant ?? null;
}

export async function GET(request: Request) {
  const authContext = await getAuthContext();
  if (authContext instanceof NextResponse) {
    return authContext;
  }

  const adminCheck = await assertAdminContext(authContext);
  if (adminCheck instanceof NextResponse) {
    return adminCheck;
  }

  const url = new URL(request.url);
  const tenantId = url.searchParams.get("tenantId")?.trim() || null;
  const tenant = await resolveTenantForAdmin({
    userId: adminCheck.id,
    tenantId,
    activeTenantId: authContext.activeTenantId
  });

  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found or not accessible." }, { status: 404 });
  }

  return NextResponse.json({ settings: mapTenantSettings(tenant) });
}

export async function PATCH(request: Request) {
  const authContext = await getAuthContext();
  if (authContext instanceof NextResponse) {
    return authContext;
  }

  const adminCheck = await assertAdminContext(authContext);
  if (adminCheck instanceof NextResponse) {
    return adminCheck;
  }

  const url = new URL(request.url);
  const tenantId = url.searchParams.get("tenantId")?.trim() || null;
  const tenant = await resolveTenantForAdmin({
    userId: adminCheck.id,
    tenantId,
    activeTenantId: authContext.activeTenantId
  });
  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found or not accessible." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    allowAzureAuth?: unknown;
    azureTenantId?: unknown;
    azureClientId?: unknown;
    azureClientSecret?: unknown;
    smtpHost?: unknown;
    smtpPort?: unknown;
    smtpSecure?: unknown;
    smtpUser?: unknown;
    smtpPass?: unknown;
    smtpFrom?: unknown;
    smtpReplyTo?: unknown;
  };

  const data: {
    allowAzureAuth?: boolean;
    azureTenantId?: string | null;
    azureClientId?: string | null;
    azureClientSecret?: string | null;
    smtpHost?: string | null;
    smtpPort?: number | null;
    smtpSecure?: boolean;
    smtpUser?: string | null;
    smtpPass?: string | null;
    smtpFrom?: string | null;
    smtpReplyTo?: string | null;
  } = {};

  if (body.allowAzureAuth !== undefined) {
    if (typeof body.allowAzureAuth !== "boolean") {
      return NextResponse.json({ error: "allowAzureAuth must be boolean." }, { status: 400 });
    }
    data.allowAzureAuth = body.allowAzureAuth;
  }

  if (body.azureTenantId !== undefined) {
    if (typeof body.azureTenantId !== "string") {
      return NextResponse.json({ error: "azureTenantId must be string." }, { status: 400 });
    }
    const normalized = body.azureTenantId.trim();
    data.azureTenantId = normalized.length > 0 ? normalized : null;
  }

  if (body.azureClientId !== undefined) {
    if (typeof body.azureClientId !== "string") {
      return NextResponse.json({ error: "azureClientId must be string." }, { status: 400 });
    }
    const normalized = body.azureClientId.trim();
    data.azureClientId = normalized.length > 0 ? normalized : null;
  }

  if (body.azureClientSecret !== undefined) {
    if (typeof body.azureClientSecret !== "string") {
      return NextResponse.json({ error: "azureClientSecret must be string." }, { status: 400 });
    }
    const normalized = body.azureClientSecret.trim();
    data.azureClientSecret = normalized.length > 0 ? normalized : null;
  }

  if (body.smtpHost !== undefined) {
    if (body.smtpHost !== null && typeof body.smtpHost !== "string") {
      return NextResponse.json({ error: "smtpHost must be string or null." }, { status: 400 });
    }
    const normalized = typeof body.smtpHost === "string" ? body.smtpHost.trim() : "";
    data.smtpHost = normalized.length > 0 ? normalized : null;
  }

  if (body.smtpPort !== undefined) {
    let parsed: number | null = null;
    if (typeof body.smtpPort === "number") {
      if (!Number.isInteger(body.smtpPort)) {
        return NextResponse.json({ error: "smtpPort must be an integer." }, { status: 400 });
      }
      parsed = body.smtpPort;
    } else if (typeof body.smtpPort === "string") {
      const normalized = body.smtpPort.trim();
      if (normalized.length > 0) {
        if (!/^\d+$/.test(normalized)) {
          return NextResponse.json({ error: "smtpPort must be numeric." }, { status: 400 });
        }
        parsed = Number.parseInt(normalized, 10);
      }
    } else if (body.smtpPort !== null) {
      return NextResponse.json({ error: "smtpPort must be number, string, or null." }, { status: 400 });
    }
    if (parsed !== null && (parsed < 1 || parsed > 65535)) {
      return NextResponse.json({ error: "smtpPort must be between 1 and 65535." }, { status: 400 });
    }
    data.smtpPort = parsed;
  }

  if (body.smtpSecure !== undefined) {
    if (typeof body.smtpSecure !== "boolean") {
      return NextResponse.json({ error: "smtpSecure must be boolean." }, { status: 400 });
    }
    data.smtpSecure = body.smtpSecure;
  }

  if (body.smtpUser !== undefined) {
    if (body.smtpUser !== null && typeof body.smtpUser !== "string") {
      return NextResponse.json({ error: "smtpUser must be string or null." }, { status: 400 });
    }
    const normalized = typeof body.smtpUser === "string" ? body.smtpUser.trim() : "";
    data.smtpUser = normalized.length > 0 ? normalized : null;
  }

  if (body.smtpPass !== undefined) {
    if (body.smtpPass !== null && typeof body.smtpPass !== "string") {
      return NextResponse.json({ error: "smtpPass must be string or null." }, { status: 400 });
    }
    const normalized = typeof body.smtpPass === "string" ? body.smtpPass.trim() : "";
    data.smtpPass = normalized.length > 0 ? normalized : null;
  }

  if (body.smtpFrom !== undefined) {
    if (body.smtpFrom !== null && typeof body.smtpFrom !== "string") {
      return NextResponse.json({ error: "smtpFrom must be string or null." }, { status: 400 });
    }
    const normalized = typeof body.smtpFrom === "string" ? body.smtpFrom.trim() : "";
    if (normalized.length > 0 && !normalizeEmail(normalized)) {
      return NextResponse.json({ error: "smtpFrom must be a valid e-mail." }, { status: 400 });
    }
    data.smtpFrom = normalized.length > 0 ? normalized : null;
  }

  if (body.smtpReplyTo !== undefined) {
    if (body.smtpReplyTo !== null && typeof body.smtpReplyTo !== "string") {
      return NextResponse.json({ error: "smtpReplyTo must be string or null." }, { status: 400 });
    }
    const normalized = typeof body.smtpReplyTo === "string" ? body.smtpReplyTo.trim() : "";
    if (normalized.length > 0 && !normalizeEmail(normalized)) {
      return NextResponse.json({ error: "smtpReplyTo must be a valid e-mail." }, { status: 400 });
    }
    data.smtpReplyTo = normalized.length > 0 ? normalized : null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid update fields provided." }, { status: 400 });
  }

  const updated = await prisma.tenant.update({
    where: { id: tenant.id },
    data,
    select: {
      id: true,
      name: true,
      supportEmail: true,
      timezone: true,
      defaultLanguage: true,
      allowLocalAuth: true,
      allowAzureAuth: true,
      azureTenantId: true,
      azureClientId: true,
      azureClientSecret: true,
      smtpHost: true,
      smtpPort: true,
      smtpSecure: true,
      smtpUser: true,
      smtpPass: true,
      smtpFrom: true,
      smtpReplyTo: true,
      createdAt: true,
      updatedAt: true
    }
  });

  return NextResponse.json({
    settings: mapTenantSettings(updated)
  });
}
