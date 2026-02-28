import { WheelRole, type User } from "@prisma/client";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type AuthContext = {
  userId: string;
  email: string | null;
  groups: string[];
};

function allowedRoles(requiredRole: WheelRole): WheelRole[] {
  if (requiredRole === WheelRole.OWNER) {
    return [WheelRole.OWNER];
  }
  if (requiredRole === WheelRole.EDITOR) {
    return [WheelRole.EDITOR, WheelRole.OWNER];
  }
  return [WheelRole.VIEWER, WheelRole.EDITOR, WheelRole.OWNER];
}

export async function getAuthContext(): Promise<AuthContext | NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return {
    userId: session.user.id,
    email: session.user.email ?? null,
    groups: session.user.groups ?? []
  };
}

export async function getOrCreateUserFromContext(context: AuthContext): Promise<User> {
  if (!context.email) {
    throw new Error("Signed-in user is missing email claim.");
  }

  return prisma.user.upsert({
    where: { email: context.email },
    update: {},
    create: {
      id: context.userId,
      email: context.email
    }
  });
}

export async function assertWheelAccess(params: {
  wheelId: string;
  context: AuthContext;
  requiredRole?: WheelRole;
}) {
  const { wheelId, context, requiredRole = WheelRole.VIEWER } = params;
  const acceptedRoles = allowedRoles(requiredRole);

  const wheel = await prisma.wheel.findFirst({
    where: {
      id: wheelId,
      OR: [
        { ownerId: context.userId },
        {
          shares: {
            some: {
              targetType: "USER",
              userId: context.userId,
              role: { in: acceptedRoles }
            }
          }
        },
        {
          shares: {
            some: {
              targetType: "AAD_GROUP",
              role: { in: acceptedRoles },
              group: {
                tenantGroupId: { in: context.groups.length > 0 ? context.groups : ["__none__"] }
              }
            }
          }
        }
      ]
    },
    select: { id: true, ownerId: true }
  });

  return wheel;
}
