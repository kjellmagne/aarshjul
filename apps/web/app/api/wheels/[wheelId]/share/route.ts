import { WheelRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { assertWheelAccess, getAuthContext, getOrCreateUserFromContext } from "@/lib/access";
import { ensureAzureGroupsByTenantIds } from "@/lib/azure-groups";
import { prisma } from "@/lib/prisma";

function toWheelRole(value: string | undefined): WheelRole {
  if (value === "OWNER") {
    return WheelRole.OWNER;
  }
  if (value === "EDITOR") {
    return WheelRole.EDITOR;
  }
  return WheelRole.VIEWER;
}

export async function GET(_request: Request, context: { params: Promise<{ wheelId: string }> }) {
  const authContext = await getAuthContext();
  if (authContext instanceof NextResponse) {
    return authContext;
  }

  const dbUser = await getOrCreateUserFromContext(authContext);
  const params = await context.params;
  const wheel = await assertWheelAccess({
    wheelId: params.wheelId,
    context: { ...authContext, userId: dbUser.id },
    requiredRole: WheelRole.EDITOR
  });

  if (!wheel) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const shares = await prisma.wheelShare.findMany({
    where: { wheelId: params.wheelId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      targetType: true,
      role: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true
        }
      },
      group: {
        select: {
          id: true,
          tenantGroupId: true,
          displayName: true
        }
      }
    }
  });

  return NextResponse.json({ shares });
}

export async function POST(request: Request, context: { params: Promise<{ wheelId: string }> }) {
  const authContext = await getAuthContext();
  if (authContext instanceof NextResponse) {
    return authContext;
  }

  const dbUser = await getOrCreateUserFromContext(authContext);
  const params = await context.params;
  const wheel = await assertWheelAccess({
    wheelId: params.wheelId,
    context: { ...authContext, userId: dbUser.id },
    requiredRole: WheelRole.OWNER
  });

  if (!wheel) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    targetType?: "USER" | "AAD_GROUP";
    role?: "VIEWER" | "EDITOR" | "OWNER";
    userEmail?: string;
    tenantGroupId?: string;
    groupDisplayName?: string;
  };

  const targetType = body.targetType;
  if (targetType !== "USER" && targetType !== "AAD_GROUP") {
    return NextResponse.json({ error: "targetType must be USER or AAD_GROUP" }, { status: 400 });
  }

  const role = toWheelRole(body.role);

  if (targetType === "USER") {
    const email = body.userEmail?.trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "userEmail is required for USER shares" }, { status: 400 });
    }

    const targetUser = await prisma.user.findFirst({
      where: {
        email,
        ...(wheel.tenantId
          ? {
              tenantMemberships: {
                some: {
                  tenantId: wheel.tenantId,
                  isDisabled: false
                }
              }
            }
          : {})
      },
      select: {
        id: true
      }
    });

    if (!targetUser) {
      return NextResponse.json(
        { error: "User must exist and be an active member of this tenant before sharing." },
        { status: 400 }
      );
    }

    const share = await prisma.$transaction(async (tx) => {
      await tx.wheelShare.deleteMany({
        where: {
          wheelId: params.wheelId,
          targetType: "USER",
          userId: targetUser.id
        }
      });

      return tx.wheelShare.create({
        data: {
          wheelId: params.wheelId,
          targetType: "USER",
          role,
          userId: targetUser.id,
          createdById: dbUser.id
        },
        select: {
          id: true,
          targetType: true,
          role: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true
            }
          }
        }
      });
    });

    return NextResponse.json({ share }, { status: 201 });
  }

  const tenantGroupId = body.tenantGroupId?.trim();
  if (!tenantGroupId) {
    return NextResponse.json({ error: "tenantGroupId is required for AAD_GROUP shares" }, { status: 400 });
  }

  const [group] = await ensureAzureGroupsByTenantIds({
    db: prisma,
    tenantGroupIds: [tenantGroupId]
  });

  if (!group) {
    return NextResponse.json({ error: "Could not resolve Azure AD group" }, { status: 400 });
  }

  if (body.groupDisplayName?.trim()) {
    await prisma.azureGroup.update({
      where: { id: group.id },
      data: { displayName: body.groupDisplayName.trim() }
    });
  }

  const share = await prisma.$transaction(async (tx) => {
    await tx.wheelShare.deleteMany({
      where: {
        wheelId: params.wheelId,
        targetType: "AAD_GROUP",
        groupId: group.id
      }
    });

    return tx.wheelShare.create({
      data: {
        wheelId: params.wheelId,
        targetType: "AAD_GROUP",
        role,
        groupId: group.id,
        createdById: dbUser.id
      },
      select: {
        id: true,
        targetType: true,
        role: true,
        group: {
          select: {
            id: true,
            tenantGroupId: true,
            displayName: true
          }
        }
      }
    });
  });

  return NextResponse.json({ share }, { status: 201 });
}

export async function DELETE(request: Request, context: { params: Promise<{ wheelId: string }> }) {
  const authContext = await getAuthContext();
  if (authContext instanceof NextResponse) {
    return authContext;
  }

  const dbUser = await getOrCreateUserFromContext(authContext);
  const params = await context.params;
  const wheel = await assertWheelAccess({
    wheelId: params.wheelId,
    context: { ...authContext, userId: dbUser.id },
    requiredRole: WheelRole.OWNER
  });

  if (!wheel) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const targetType = url.searchParams.get("targetType");

  if (targetType === "USER") {
    const userEmail = url.searchParams.get("userEmail")?.trim().toLowerCase();
    if (!userEmail) {
      return NextResponse.json({ error: "userEmail is required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email: userEmail }, select: { id: true } });
    if (!user) {
      return NextResponse.json({ removed: 0 });
    }

    const result = await prisma.wheelShare.deleteMany({
      where: {
        wheelId: params.wheelId,
        targetType: "USER",
        userId: user.id
      }
    });
    return NextResponse.json({ removed: result.count });
  }

  if (targetType === "AAD_GROUP") {
    const tenantGroupId = url.searchParams.get("tenantGroupId")?.trim();
    if (!tenantGroupId) {
      return NextResponse.json({ error: "tenantGroupId is required" }, { status: 400 });
    }

    const group = await prisma.azureGroup.findUnique({
      where: { tenantGroupId },
      select: { id: true }
    });

    if (!group) {
      return NextResponse.json({ removed: 0 });
    }

    const result = await prisma.wheelShare.deleteMany({
      where: {
        wheelId: params.wheelId,
        targetType: "AAD_GROUP",
        groupId: group.id
      }
    });

    return NextResponse.json({ removed: result.count });
  }

  return NextResponse.json({ error: "targetType must be USER or AAD_GROUP" }, { status: 400 });
}
