import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

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
  const groups = authContext.groups.length > 0 ? authContext.groups : ["__none__"];

  await prisma.wheel.updateMany({
    where: {
      ownerId: dbUser.id,
      tenantId: null
    },
    data: {
      tenantId: activeTenantId
    }
  });

  const wheels = await prisma.wheel.findMany({
    where: {
      tenantId: activeTenantId,
      OR: [
        { ownerId: dbUser.id },
        {
          shares: {
            some: {
              targetType: "USER",
              userId: dbUser.id
            }
          }
        },
        {
          shares: {
            some: {
              targetType: "AAD_GROUP",
              group: {
                tenantGroupId: { in: groups }
              }
            }
          }
        }
      ]
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      timezone: true,
      startDate: true,
      durationMonths: true,
      config: true,
      ownerId: true,
      updatedAt: true
    }
  });

  return NextResponse.json({ wheels });
}

export async function POST(request: Request) {
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
  const body = (await request.json()) as {
    title?: string;
    timezone?: string;
    startDate?: string;
    durationMonths?: number;
    config?: unknown;
  };

  const title = body.title?.trim();
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const durationMonths = [3, 6, 12].includes(body.durationMonths ?? 12) ? (body.durationMonths ?? 12) : 12;
  const startDate = body.startDate ? new Date(body.startDate) : new Date();
  if (Number.isNaN(startDate.getTime())) {
    return NextResponse.json({ error: "Invalid startDate" }, { status: 400 });
  }

  const wheel = await prisma.wheel.create({
    data: {
      title,
      timezone: body.timezone?.trim() || "Europe/Oslo",
      startDate,
      durationMonths,
      config: body.config === null ? Prisma.JsonNull : ((body.config ?? undefined) as Prisma.InputJsonValue | undefined),
      ownerId: dbUser.id,
      tenantId: activeTenantId
    },
    select: {
      id: true,
      title: true,
      timezone: true,
      startDate: true,
      durationMonths: true,
      config: true,
      ownerId: true,
      createdAt: true
    }
  });

  return NextResponse.json({ wheel }, { status: 201 });
}
