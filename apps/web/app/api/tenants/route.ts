import { NextResponse } from "next/server";
import { TenantRole } from "@prisma/client";

import { getAuthContext, getOrCreateUserFromContext } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const authContext = await getAuthContext();
  if (authContext instanceof NextResponse) {
    return authContext;
  }

  const user = await getOrCreateUserFromContext(authContext);
  const memberships = await prisma.tenantMembership.findMany({
    where: {
      userId: user.id,
      isDisabled: false
    },
    orderBy: [{ createdAt: "asc" }],
    select: {
      tenantId: true,
      role: true,
      tenant: {
        select: {
          id: true,
          name: true,
          slug: true
        }
      }
    }
  });

  const activeTenantId =
    authContext.activeTenantId && memberships.some((membership) => membership.tenantId === authContext.activeTenantId)
      ? authContext.activeTenantId
      : memberships[0]?.tenantId ?? null;

  return NextResponse.json({
    activeTenantId,
    tenants: memberships.map((membership) => ({
      tenantId: membership.tenantId,
      role: membership.role === TenantRole.ADMIN ? "ADMIN" : "MEMBER",
      tenant: membership.tenant
    }))
  });
}
