import { TenantRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { assertAdminContext, getAuthContext } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const authContext = await getAuthContext();
  if (authContext instanceof NextResponse) {
    return authContext;
  }

  const adminCheck = await assertAdminContext(authContext);
  if (adminCheck instanceof NextResponse) {
    return adminCheck;
  }

  const memberships = await prisma.tenantMembership.findMany({
    where: {
      userId: adminCheck.id,
      role: TenantRole.ADMIN,
      isDisabled: false
    },
    orderBy: [{ createdAt: "asc" }],
    select: {
      tenant: {
        select: {
          id: true,
          name: true,
          slug: true
        }
      }
    }
  });

  return NextResponse.json({
    tenants: memberships.map((entry) => entry.tenant)
  });
}
