import { NextResponse } from "next/server";
import { TenantRole } from "@prisma/client";

import { assertSystemAdminContext, getAuthContext } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { ensureDefaultTenant } from "@/lib/tenant";

export async function GET() {
  const authContext = await getAuthContext();
  if (authContext instanceof NextResponse) {
    return authContext;
  }

  const systemAdmin = await assertSystemAdminContext(authContext);
  if (systemAdmin instanceof NextResponse) {
    return systemAdmin;
  }

  await ensureDefaultTenant();

  const [users, systemAdmins, tenantAdmins, tenants, tenantAdminAssignments, wheels, activities, shares, groups, accounts] =
    await prisma.$transaction([
    prisma.user.count(),
    prisma.user.count({ where: { isSystemAdmin: true } }),
    prisma.user.count({ where: { isAdmin: true } }),
    prisma.tenant.count(),
    prisma.tenantMembership.count({ where: { role: TenantRole.ADMIN } }),
    prisma.wheel.count(),
    prisma.activity.count(),
    prisma.wheelShare.count(),
    prisma.azureGroup.count(),
    prisma.account.count()
    ]);

  return NextResponse.json({
    overview: {
      users,
      systemAdmins,
      tenantAdmins,
      tenants,
      tenantAdminAssignments,
      wheels,
      activities,
      shares,
      groups,
      accounts
    }
  });
}
