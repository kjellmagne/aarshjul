import { ApiKeyScope, Prisma, TenantRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { assertAdminContext, getAuthContext } from "@/lib/access";
import { generateApiKey } from "@/lib/api-keys";
import { prisma } from "@/lib/prisma";

type TenantApiKeyCreateBody = {
  name?: unknown;
  expiresAt?: unknown;
};

function asString(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function parseOptionalDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error("expiresAt must be an ISO date string.");
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("expiresAt must be a valid ISO date.");
  }
  return date;
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

export async function GET(request: Request) {
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

  const apiKeys = await prisma.apiKey.findMany({
    where: {
      scope: ApiKeyScope.TENANT,
      tenantId
    },
    orderBy: [{ createdAt: "desc" }],
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

  return NextResponse.json({
    tenantId,
    apiKeys
  });
}

export async function POST(request: Request) {
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

  const body = (await request.json().catch(() => ({}))) as TenantApiKeyCreateBody;
  const name = asString(body.name);
  if (!name) {
    return NextResponse.json({ error: "name is required." }, { status: 400 });
  }

  let expiresAt: Date | null = null;
  try {
    expiresAt = parseOptionalDate(body.expiresAt);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid expiresAt." }, { status: 400 });
  }
  if (expiresAt && expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: "expiresAt must be in the future." }, { status: 400 });
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const generated = generateApiKey(ApiKeyScope.TENANT);

    try {
      const created = await prisma.apiKey.create({
        data: {
          scope: ApiKeyScope.TENANT,
          tenantId,
          name,
          prefix: generated.prefix,
          secretHash: generated.hash,
          createdById: adminCheck.id,
          expiresAt
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

      return NextResponse.json(
        {
          apiKey: created,
          plainTextKey: generated.value
        },
        { status: 201 }
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        continue;
      }
      throw error;
    }
  }

  return NextResponse.json({ error: "Could not generate unique API key. Try again." }, { status: 500 });
}
