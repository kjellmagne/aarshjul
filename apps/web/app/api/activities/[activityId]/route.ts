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

export async function PATCH(request: Request, context: { params: Promise<{ activityId: string }> }) {
  const authContext = await getAuthContext(request);
  if (authContext instanceof NextResponse) {
    return authContext;
  }

  let actorContext = authContext;
  if (authContext.authMethod === "SESSION") {
    const dbUser = await getOrCreateUserFromContext(authContext);
    actorContext = { ...authContext, userId: dbUser.id };
  }
  const params = await context.params;
  const existing = await prisma.activity.findUnique({ where: { id: params.activityId } });

  if (!existing) {
    return NextResponse.json({ error: "Activity not found" }, { status: 404 });
  }

  const hasAccess = await assertWheelAccess({
    wheelId: existing.wheelId,
    context: actorContext,
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

  const startAt = body.startAt ? new Date(body.startAt) : existing.startAt;
  const endAt = body.endAt ? new Date(body.endAt) : existing.endAt;
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
    return NextResponse.json({ error: "Invalid time range" }, { status: 400 });
  }

  const activity = await prisma.activity.update({
    where: { id: existing.id },
    data: {
      ringId: body.ringId ?? existing.ringId,
      title: body.title?.trim() || existing.title,
      description: body.description?.trim() || existing.description,
      color: body.color?.trim() || existing.color,
      startAt,
      endAt,
      ...(body.tags ? { tags: normalizeTags(body.tags) } : {})
    },
    include: {
      schedule: true
    }
  });

  return NextResponse.json({ activity });
}

export async function DELETE(request: Request, context: { params: Promise<{ activityId: string }> }) {
  const authContext = await getAuthContext(request);
  if (authContext instanceof NextResponse) {
    return authContext;
  }

  let actorContext = authContext;
  if (authContext.authMethod === "SESSION") {
    const dbUser = await getOrCreateUserFromContext(authContext);
    actorContext = { ...authContext, userId: dbUser.id };
  }
  const params = await context.params;
  const existing = await prisma.activity.findUnique({ where: { id: params.activityId } });

  if (!existing) {
    return NextResponse.json({ removed: 0 });
  }

  const hasAccess = await assertWheelAccess({
    wheelId: existing.wheelId,
    context: actorContext,
    requiredRole: WheelRole.EDITOR
  });

  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.activity.delete({ where: { id: existing.id } });
  return NextResponse.json({ removed: 1 });
}
