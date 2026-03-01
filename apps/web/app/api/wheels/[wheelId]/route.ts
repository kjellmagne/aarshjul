import { Prisma, WheelRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { assertWheelAccess, getAuthContext, getOrCreateUserFromContext } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, context: { params: Promise<{ wheelId: string }> }) {
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

  const hasAccess = await assertWheelAccess({
    wheelId: params.wheelId,
    context: actorContext,
    requiredRole: WheelRole.VIEWER
  });

  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const wheel = await prisma.wheel.findUnique({
    where: { id: params.wheelId },
    select: {
      id: true,
      title: true,
      timezone: true,
      startDate: true,
      durationMonths: true,
      config: true,
      ownerId: true,
      createdAt: true,
      updatedAt: true
    }
  });

  if (!wheel) {
    return NextResponse.json({ error: "Wheel not found" }, { status: 404 });
  }

  return NextResponse.json({ wheel });
}

export async function PATCH(request: Request, context: { params: Promise<{ wheelId: string }> }) {
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

  const hasAccess = await assertWheelAccess({
    wheelId: params.wheelId,
    context: actorContext,
    requiredRole: WheelRole.EDITOR
  });

  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    title?: string;
    timezone?: string;
    startDate?: string;
    durationMonths?: number;
    config?: unknown;
  };

  const data: Prisma.WheelUpdateInput = {};

  if (typeof body.title === "string" && body.title.trim()) {
    data.title = body.title.trim();
  }

  if (typeof body.timezone === "string" && body.timezone.trim()) {
    data.timezone = body.timezone.trim();
  }

  if (typeof body.startDate === "string") {
    const parsedStart = new Date(body.startDate);
    if (Number.isNaN(parsedStart.getTime())) {
      return NextResponse.json({ error: "Invalid startDate" }, { status: 400 });
    }
    data.startDate = parsedStart;
  }

  if (typeof body.durationMonths === "number" && [3, 6, 12].includes(body.durationMonths)) {
    data.durationMonths = body.durationMonths;
  }

  if (Object.hasOwn(body, "config")) {
    data.config =
      body.config === null
        ? Prisma.JsonNull
        : (body.config as Prisma.InputJsonValue);
  }

  const wheel = await prisma.wheel.update({
    where: { id: params.wheelId },
    data,
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

  return NextResponse.json({ wheel });
}

export async function DELETE(request: Request, context: { params: Promise<{ wheelId: string }> }) {
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

  const hasAccess = await assertWheelAccess({
    wheelId: params.wheelId,
    context: actorContext,
    requiredRole: WheelRole.OWNER
  });

  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.wheel.delete({
    where: { id: params.wheelId }
  });

  return NextResponse.json({ removed: 1 });
}
