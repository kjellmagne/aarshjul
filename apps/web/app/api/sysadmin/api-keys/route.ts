import { ApiKeyScope, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { assertSystemAdminContext, getAuthContext } from "@/lib/access";
import { generateApiKey } from "@/lib/api-keys";
import { prisma } from "@/lib/prisma";

type SystemApiKeyCreateBody = {
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

export async function GET() {
  const authContext = await getAuthContext();
  if (authContext instanceof NextResponse) {
    return authContext;
  }

  const systemAdmin = await assertSystemAdminContext(authContext);
  if (systemAdmin instanceof NextResponse) {
    return systemAdmin;
  }

  const apiKeys = await prisma.apiKey.findMany({
    where: {
      scope: ApiKeyScope.SYSTEM
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

  return NextResponse.json({ apiKeys });
}

export async function POST(request: Request) {
  const authContext = await getAuthContext();
  if (authContext instanceof NextResponse) {
    return authContext;
  }

  const systemAdmin = await assertSystemAdminContext(authContext);
  if (systemAdmin instanceof NextResponse) {
    return systemAdmin;
  }

  const body = (await request.json().catch(() => ({}))) as SystemApiKeyCreateBody;
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
    const generated = generateApiKey(ApiKeyScope.SYSTEM);
    try {
      const created = await prisma.apiKey.create({
        data: {
          scope: ApiKeyScope.SYSTEM,
          tenantId: null,
          name,
          prefix: generated.prefix,
          secretHash: generated.hash,
          createdById: systemAdmin.id,
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
