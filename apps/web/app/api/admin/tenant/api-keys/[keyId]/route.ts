import { ApiKeyScope, TenantRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { assertAdminContext, getAuthContext } from "@/lib/access";
import { prisma } from "@/lib/prisma";

type TenantApiKeyPatchBody = {
  action?: unknown;
};

function asString(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

async function resolveTenantId(params: { userId: string; requestedTenantId: string | null; activeTenantId: string | null }) {
  const preferredTenantId = params.requestedTenantId || params.activeTenantId;
  if (preferredTenantId) {
    const membership = await prisma.tenantMembership.findFirst({
      where: {
        userId: params.userId,
        tenantId: preferredTenantId,
        role: TenantRole.ADMIN,
        isDisabled: false
      },
      select: {
        tenantId: true
      }
    });
    return membership?.tenantId ?? null;
  }

  const membership = await prisma.tenantMembership.findFirst({
    where: {
      userId: params.userId,
      role: TenantRole.ADMIN,
      isDisabled: false
    },
    orderBy: [{ createdAt: "asc" }],
    select: {
      tenantId: true
    }
  });
  return membership?.tenantId ?? null;
}

async function loadTenantKey(params: { keyId: string; tenantId: string }) {
  return prisma.apiKey.findFirst({
    where: {
      id: params.keyId,
      scope: ApiKeyScope.TENANT,
      tenantId: params.tenantId
    },
    select: {
      id: true
    }
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ keyId: string }> }) {
  const authContext = await getAuthContext();
  if (authContext instanceof NextResponse) {
    return authContext;
  }

  const adminCheck = await assertAdminContext(authContext);
  if (adminCheck instanceof NextResponse) {
    return adminCheck;
  }

  const requestedTenantId = new URL(request.url).searchParams.get("tenantId")?.trim() || null;
  const tenantId = await resolveTenantId({
    userId: adminCheck.id,
    requestedTenantId,
    activeTenantId: authContext.activeTenantId
  });
  if (!tenantId) {
    return NextResponse.json({ error: "Tenant not found or not accessible." }, { status: 403 });
  }

  const { keyId } = await context.params;
  const apiKey = await loadTenantKey({ keyId, tenantId });
  if (!apiKey) {
    return NextResponse.json({ error: "API key not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as TenantApiKeyPatchBody;
  const action = asString(body.action);
  if (action !== "revoke" && action !== "activate") {
    return NextResponse.json({ error: "action must be revoke or activate." }, { status: 400 });
  }

  const updated = await prisma.apiKey.update({
    where: { id: keyId },
    data: {
      revokedAt: action === "revoke" ? new Date() : null
    },
    select: {
      id: true,
      name: true,
      prefix: true,
      createdAt: true,
      updatedAt: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    }
  });

  return NextResponse.json({ apiKey: updated });
}

export async function DELETE(request: Request, context: { params: Promise<{ keyId: string }> }) {
  const authContext = await getAuthContext();
  if (authContext instanceof NextResponse) {
    return authContext;
  }

  const adminCheck = await assertAdminContext(authContext);
  if (adminCheck instanceof NextResponse) {
    return adminCheck;
  }

  const requestedTenantId = new URL(request.url).searchParams.get("tenantId")?.trim() || null;
  const tenantId = await resolveTenantId({
    userId: adminCheck.id,
    requestedTenantId,
    activeTenantId: authContext.activeTenantId
  });
  if (!tenantId) {
    return NextResponse.json({ error: "Tenant not found or not accessible." }, { status: 403 });
  }

  const { keyId } = await context.params;
  const apiKey = await loadTenantKey({ keyId, tenantId });
  if (!apiKey) {
    return NextResponse.json({ error: "API key not found." }, { status: 404 });
  }

  await prisma.apiKey.delete({
    where: { id: keyId }
  });

  return NextResponse.json({ deleted: true });
}
