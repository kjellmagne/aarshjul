import { WheelRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { assertWheelAccess, getAuthContext, getOrCreateUserFromContext } from "@/lib/access";
import { prisma } from "@/lib/prisma";

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.map((entry) => String(entry).trim()).filter(Boolean))];
}

export async function GET(_request: Request, context: { params: Promise<{ wheelId: string }> }) {
  const authContext = await getAuthContext();
  if (authContext instanceof NextResponse) {
    return authContext;
  }

  const dbUser = await getOrCreateUserFromContext(authContext);
  const params = await context.params;

  const hasAccess = await assertWheelAccess({
    wheelId: params.wheelId,
    context: { ...authContext, userId: dbUser.id },
    requiredRole: WheelRole.VIEWER
  });

  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const activities = await prisma.activity.findMany({
    where: { wheelId: params.wheelId },
    orderBy: { startAt: "asc" },
    include: {
      schedule: true
    }
  });

  return NextResponse.json({ activities });
}

export async function POST(request: Request, context: { params: Promise<{ wheelId: string }> }) {
  const authContext = await getAuthContext();
  if (authContext instanceof NextResponse) {
    return authContext;
  }

  const dbUser = await getOrCreateUserFromContext(authContext);
  const params = await context.params;

  const hasAccess = await assertWheelAccess({
    wheelId: params.wheelId,
    context: { ...authContext, userId: dbUser.id },
    requiredRole: WheelRole.EDITOR
  });

  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    ringId?: string;
    title?: string;
    description?: string;
    color?: string;
    startAt?: string;
    endAt?: string;
    tags?: string[];
  };

  const title = body.title?.trim();
  if (!title || !body.ringId || !body.startAt || !body.endAt) {
    return NextResponse.json({ error: "ringId, title, startAt and endAt are required" }, { status: 400 });
  }

  const startAt = new Date(body.startAt);
  const endAt = new Date(body.endAt);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
    return NextResponse.json({ error: "Invalid time range" }, { status: 400 });
  }

  const activity = await prisma.activity.create({
    data: {
      wheelId: params.wheelId,
      ringId: body.ringId,
      title,
      description: body.description?.trim() || null,
      color: body.color?.trim() || "#6da8c7",
      startAt,
      endAt,
      tags: normalizeTags(body.tags),
      createdById: dbUser.id
    },
    include: {
      schedule: true
    }
  });

  return NextResponse.json({ activity }, { status: 201 });
}
