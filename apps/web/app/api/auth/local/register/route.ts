import { hash } from "bcryptjs";
import { NextResponse } from "next/server";

import { isBootstrapAdminEmail, isBootstrapSystemAdminEmail } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { ensureDefaultTenant } from "@/lib/tenant";

function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().toLowerCase();
}

function normalizeName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const next = value.trim();
  return next ? next : null;
}

function normalizeTenantId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const next = value.trim();
  return next ? next : null;
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    email?: unknown;
    password?: unknown;
    name?: unknown;
    tenantId?: unknown;
  };

  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  const name = normalizeName(body.name);
  const requestedTenantId = normalizeTenantId(body.tenantId);

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Invalid e-mail address" }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const passwordHash = await hash(password, 12);
  const bootstrapAdmin = isBootstrapAdminEmail(email);
  const bootstrapSystemAdmin = isBootstrapSystemAdminEmail(email);
  let targetTenantId: string | null = null;
  if (!bootstrapSystemAdmin) {
    if (requestedTenantId) {
      const requestedTenant = await prisma.tenant.findUnique({
        where: { id: requestedTenantId },
        select: { id: true, allowLocalAuth: true }
      });
      if (!requestedTenant || !requestedTenant.allowLocalAuth) {
        return NextResponse.json({ error: "Selected tenant does not allow local registration" }, { status: 400 });
      }
      targetTenantId = requestedTenant.id;
    } else {
      const defaultTenant = await ensureDefaultTenant();
      targetTenantId = defaultTenant.id;
    }
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true }
  });

  if (existing?.passwordHash) {
    return NextResponse.json({ error: "A local account already exists for this e-mail" }, { status: 409 });
  }

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        ...(bootstrapAdmin ? { isAdmin: true } : {}),
        ...(bootstrapSystemAdmin ? { isSystemAdmin: true } : {}),
        ...(name ? { name } : {})
      }
    });
    if (targetTenantId) {
      await prisma.tenantMembership.upsert({
        where: {
          tenantId_userId: {
            tenantId: targetTenantId,
            userId: existing.id
          }
        },
        update: {
          isDisabled: false
        },
        create: {
          tenantId: targetTenantId,
          userId: existing.id,
          isDisabled: false
        }
      });
    }
    return NextResponse.json({ ok: true, mode: "updated" });
  }

  const created = await prisma.user.create({
    data: {
      email,
      passwordHash,
      ...(bootstrapAdmin ? { isAdmin: true } : {}),
      ...(bootstrapSystemAdmin ? { isSystemAdmin: true } : {}),
      ...(name ? { name } : {})
    }
  });
  if (targetTenantId) {
    await prisma.tenantMembership.create({
      data: {
        tenantId: targetTenantId,
        userId: created.id,
        isDisabled: false
      }
    });
  }

  return NextResponse.json({ ok: true, mode: "created" }, { status: 201 });
}
