import { ApiKeyScope } from "@prisma/client";
import { NextResponse } from "next/server";

import { assertSystemAdminContext, getAuthContext } from "@/lib/access";
import { prisma } from "@/lib/prisma";

type SystemApiKeyPatchBody = {
  action?: unknown;
};

function asString(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

async function loadSystemKey(keyId: string) {
  return prisma.apiKey.findFirst({
    where: {
      id: keyId,
      scope: ApiKeyScope.SYSTEM
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

  const systemAdmin = await assertSystemAdminContext(authContext);
  if (systemAdmin instanceof NextResponse) {
    return systemAdmin;
  }

  const { keyId } = await context.params;
  const apiKey = await loadSystemKey(keyId);
  if (!apiKey) {
    return NextResponse.json({ error: "API key not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as SystemApiKeyPatchBody;
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

export async function DELETE(_request: Request, context: { params: Promise<{ keyId: string }> }) {
  const authContext = await getAuthContext();
  if (authContext instanceof NextResponse) {
    return authContext;
  }

  const systemAdmin = await assertSystemAdminContext(authContext);
  if (systemAdmin instanceof NextResponse) {
    return systemAdmin;
  }

  const { keyId } = await context.params;
  const apiKey = await loadSystemKey(keyId);
  if (!apiKey) {
    return NextResponse.json({ error: "API key not found." }, { status: 404 });
  }

  await prisma.apiKey.delete({
    where: { id: keyId }
  });

  return NextResponse.json({ deleted: true });
}
