import { NextResponse } from "next/server";
import { TenantRole } from "@prisma/client";

import { assertSystemAdminContext, getAuthContext } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { ensureDefaultTenant } from "@/lib/tenant";

type UserRolePatchBody = {
  isAdmin?: unknown;
  isSystemAdmin?: unknown;
};

export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  const authContext = await getAuthContext();
  if (authContext instanceof NextResponse) {
    return authContext;
  }

  const systemAdmin = await assertSystemAdminContext(authContext);
  if (systemAdmin instanceof NextResponse) {
    return systemAdmin;
  }

  const params = await context.params;
  const body = (await request.json().catch(() => ({}))) as UserRolePatchBody;
  const data: { isAdmin?: boolean; isSystemAdmin?: boolean } = {};

  if (body.isAdmin !== undefined) {
    if (typeof body.isAdmin !== "boolean") {
      return NextResponse.json({ error: "isAdmin must be boolean" }, { status: 400 });
    }
    data.isAdmin = body.isAdmin;
  }

  if (body.isSystemAdmin !== undefined) {
    if (typeof body.isSystemAdmin !== "boolean") {
      return NextResponse.json({ error: "isSystemAdmin must be boolean" }, { status: 400 });
    }
    data.isSystemAdmin = body.isSystemAdmin;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No role field provided." }, { status: 400 });
  }

  if (params.userId === systemAdmin.id && data.isSystemAdmin === false) {
    return NextResponse.json({ error: "You cannot remove your own system admin role." }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { id: true, isSystemAdmin: true }
  });
  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  if (target.isSystemAdmin && data.isSystemAdmin === false) {
    const systemAdminCount = await prisma.user.count({
      where: { isSystemAdmin: true }
    });
    if (systemAdminCount <= 1) {
      return NextResponse.json({ error: "At least one system admin is required." }, { status: 400 });
    }
  }

  if (body.isAdmin === true) {
    const defaultTenant = await ensureDefaultTenant();
    await prisma.tenantMembership.upsert({
      where: {
        tenantId_userId: {
          tenantId: defaultTenant.id,
          userId: params.userId
        }
      },
      update: {
        role: TenantRole.ADMIN
      },
      create: {
        tenantId: defaultTenant.id,
        userId: params.userId,
        role: TenantRole.ADMIN
      }
    });
  }

  if (body.isAdmin === false) {
    await prisma.tenantMembership.deleteMany({
      where: {
        userId: params.userId,
        role: TenantRole.ADMIN
      }
    });
  }

  const updated = await prisma.user.update({
    where: { id: params.userId },
    data,
    select: {
      id: true,
      email: true,
      name: true,
      isAdmin: true,
      isSystemAdmin: true
    }
  });

  return NextResponse.json({ user: updated });
}
