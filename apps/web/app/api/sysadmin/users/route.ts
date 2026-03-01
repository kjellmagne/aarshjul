import { NextResponse } from "next/server";

import { assertSystemAdminContext, getAuthContext } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const authContext = await getAuthContext();
  if (authContext instanceof NextResponse) {
    return authContext;
  }

  const systemAdmin = await assertSystemAdminContext(authContext);
  if (systemAdmin instanceof NextResponse) {
    return systemAdmin;
  }

  const users = await prisma.user.findMany({
    orderBy: [{ isSystemAdmin: "desc" }, { isAdmin: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      email: true,
      name: true,
      isAdmin: true,
      isSystemAdmin: true,
      lastLoginAt: true,
      createdAt: true,
      passwordHash: true,
      azureAdObjectId: true,
      accounts: {
        select: {
          provider: true
        }
      },
      _count: {
        select: {
          ownedWheels: true,
          wheelUserShares: true,
          activitiesCreated: true
        }
      }
    }
  });

  return NextResponse.json({
    users: users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      isAdmin: user.isAdmin,
      isSystemAdmin: user.isSystemAdmin,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      hasLocalPassword: Boolean(user.passwordHash),
      hasAzureIdentity: Boolean(user.azureAdObjectId) || user.accounts.some((account) => account.provider === "azure-ad"),
      providers: [...new Set(user.accounts.map((account) => account.provider))],
      counts: user._count
    }))
  });
}
