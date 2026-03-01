import { NextResponse } from "next/server";

import { assertActiveTenantAccess, getAuthContext, getOrCreateUserFromContext } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const authContext = await getAuthContext();
  if (authContext instanceof NextResponse) {
    return authContext;
  }

  const dbUser = await getOrCreateUserFromContext(authContext);
  const activeTenantId = await assertActiveTenantAccess({
    context: authContext,
    userId: dbUser.id
  });
  if (activeTenantId instanceof NextResponse) {
    return activeTenantId;
  }

  const users = await prisma.user.findMany({
    where: {
      id: {
        not: dbUser.id
      },
      isSystemAdmin: false,
      email: {
        not: null
      },
      tenantMemberships: {
        some: {
          tenantId: activeTenantId,
          isDisabled: false
        }
      }
    },
    orderBy: [{ name: "asc" }, { email: "asc" }],
    select: {
      id: true,
      name: true,
      email: true
    }
  });

  return NextResponse.json({
    users: users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email
    }))
  });
}
