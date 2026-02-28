import { ScheduleCadence, WheelRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { assertWheelAccess, getAuthContext, getOrCreateUserFromContext } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { computeNextDeadline, syncReminderQueue } from "@/lib/reminders";

function toCadence(input: string | undefined): ScheduleCadence {
  switch (input) {
    case "NONE":
      return ScheduleCadence.NONE;
    case "ONCE":
      return ScheduleCadence.ONCE;
    case "DAILY":
      return ScheduleCadence.DAILY;
    case "WEEKLY":
      return ScheduleCadence.WEEKLY;
    case "MONTHLY":
      return ScheduleCadence.MONTHLY;
    case "CUSTOM_RRULE":
      return ScheduleCadence.CUSTOM_RRULE;
    default:
      return ScheduleCadence.ONCE;
  }
}

function sanitizeOffsets(values: unknown): number[] {
  if (!Array.isArray(values)) {
    return [];
  }
  return [...new Set(values.map((value) => Number.parseInt(String(value), 10)).filter((value) => Number.isFinite(value) && value >= 0))]
    .sort((a, b) => a - b)
    .slice(0, 12);
}

function sanitizeEmails(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  return [...new Set(values.map((value) => String(value).trim().toLowerCase()).filter(Boolean))].slice(0, 25);
}

export async function GET(_request: Request, context: { params: Promise<{ activityId: string }> }) {
  const authContext = await getAuthContext();
  if (authContext instanceof NextResponse) {
    return authContext;
  }

  const dbUser = await getOrCreateUserFromContext(authContext);
  const params = await context.params;

  const activity = await prisma.activity.findUnique({
    where: { id: params.activityId },
    include: { schedule: true }
  });

  if (!activity) {
    return NextResponse.json({ error: "Activity not found" }, { status: 404 });
  }

  const hasAccess = await assertWheelAccess({
    wheelId: activity.wheelId,
    context: { ...authContext, userId: dbUser.id },
    requiredRole: WheelRole.VIEWER
  });

  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    schedule: activity.schedule
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ activityId: string }> }) {
  const authContext = await getAuthContext();
  if (authContext instanceof NextResponse) {
    return authContext;
  }

  const dbUser = await getOrCreateUserFromContext(authContext);
  const params = await context.params;

  const activity = await prisma.activity.findUnique({
    where: { id: params.activityId }
  });

  if (!activity) {
    return NextResponse.json({ error: "Activity not found" }, { status: 404 });
  }

  const hasAccess = await assertWheelAccess({
    wheelId: activity.wheelId,
    context: { ...authContext, userId: dbUser.id },
    requiredRole: WheelRole.EDITOR
  });

  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    cadence?: string;
    timezone?: string;
    deadlineAt?: string | null;
    rrule?: string | null;
    reminderOffsetsMinutes?: number[];
    reminderEmails?: string[];
    isEnabled?: boolean;
  };

  const cadence = toCadence(body.cadence);
  const timezone = body.timezone?.trim() || "Europe/Oslo";
  const deadlineAt = body.deadlineAt ? new Date(body.deadlineAt) : null;

  if (deadlineAt && Number.isNaN(deadlineAt.getTime())) {
    return NextResponse.json({ error: "Invalid deadlineAt" }, { status: 400 });
  }

  const reminderOffsetsMinutes = sanitizeOffsets(body.reminderOffsetsMinutes);
  const reminderEmails = sanitizeEmails(body.reminderEmails);
  const isEnabled = body.isEnabled ?? true;

  const nextDeadlineAt = computeNextDeadline({
    schedule: {
      cadence,
      deadlineAt,
      timezone
    }
  });

  const result = await prisma.$transaction(async (tx) => {
    const schedule = await tx.activitySchedule.upsert({
      where: { activityId: activity.id },
      update: {
        cadence,
        timezone,
        deadlineAt,
        rrule: body.rrule ?? null,
        reminderOffsetsMinutes,
        reminderEmails,
        isEnabled,
        nextDeadlineAt,
        lastComputedAt: new Date()
      },
      create: {
        activityId: activity.id,
        cadence,
        timezone,
        deadlineAt,
        rrule: body.rrule ?? null,
        reminderOffsetsMinutes,
        reminderEmails,
        isEnabled,
        nextDeadlineAt,
        lastComputedAt: new Date()
      }
    });

    await syncReminderQueue({
      db: tx,
      activity,
      schedule
    });

    return schedule;
  });

  return NextResponse.json({ schedule: result });
}
