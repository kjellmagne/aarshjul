import { TenantRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { assertAdminContext, getAuthContext } from "@/lib/access";
import { prisma } from "@/lib/prisma";

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

  const memberships = await prisma.tenantMembership.findMany({
    where: {
      tenantId,
      isDisabled: false,
      user: {
        isSystemAdmin: false
      }
    },
    select: { userId: true }
  });
  const userIds = [...new Set(memberships.map((entry) => entry.userId))];

  const [users, wheels, activities, shares, groups, accounts, localAccounts, azureAccounts] = await prisma.$transaction([
    prisma.tenantMembership.count({
      where: {
        tenantId,
        isDisabled: false,
        user: {
          isSystemAdmin: false
        }
      }
    }),
    prisma.wheel.count({ where: { tenantId } }),
    prisma.activity.count({ where: { wheel: { tenantId } } }),
    prisma.wheelShare.count({ where: { wheel: { tenantId } } }),
    prisma.wheelShare.count({ where: { wheel: { tenantId }, targetType: "AAD_GROUP" } }),
    prisma.account.count({ where: { userId: { in: userIds } } }),
    prisma.user.count({ where: { id: { in: userIds }, passwordHash: { not: null } } }),
    prisma.account.count({ where: { userId: { in: userIds }, provider: "azure-ad" } })
  ]);

  return NextResponse.json({
    tenantId,
    overview: {
      users,
      wheels,
      activities,
      shares,
      groups,
      accounts,
      localAccounts,
      azureAccounts
    }
  });
}
