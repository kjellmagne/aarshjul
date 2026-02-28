import {
  Prisma,
  ScheduleCadence,
  type Activity,
  type ActivitySchedule,
  type PrismaClient
} from "@prisma/client";
import { DateTime } from "luxon";

const MAX_REMINDER_OFFSETS = 12;

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values.map((value) => Math.trunc(value)).filter((value) => Number.isFinite(value) && value >= 0))]
    .sort((a, b) => a - b)
    .slice(0, MAX_REMINDER_OFFSETS);
}

function uniqueEmails(values: string[]): string[] {
  return [...new Set(values.map((entry) => entry.trim().toLowerCase()).filter(Boolean))];
}

function plusCadence(date: DateTime, cadence: ScheduleCadence): DateTime {
  if (cadence === ScheduleCadence.DAILY) {
    return date.plus({ days: 1 });
  }
  if (cadence === ScheduleCadence.WEEKLY) {
    return date.plus({ weeks: 1 });
  }
  if (cadence === ScheduleCadence.MONTHLY) {
    return date.plus({ months: 1 });
  }
  return date;
}

export function computeNextDeadline(params: {
  schedule: {
    cadence: ScheduleCadence;
    deadlineAt: Date | null;
    timezone: string;
  };
  now?: DateTime;
}): Date | null {
  const now = params.now ?? DateTime.now().setZone(params.schedule.timezone);
  const rawDeadline = params.schedule.deadlineAt;

  if (!rawDeadline) {
    return null;
  }

  let candidate = DateTime.fromJSDate(rawDeadline, { zone: params.schedule.timezone });
  if (!candidate.isValid) {
    return null;
  }

  if (params.schedule.cadence === ScheduleCadence.NONE) {
    return null;
  }

  if (params.schedule.cadence === ScheduleCadence.ONCE || params.schedule.cadence === ScheduleCadence.CUSTOM_RRULE) {
    return candidate > now ? candidate.toJSDate() : null;
  }

  let guard = 0;
  while (candidate <= now && guard < 600) {
    candidate = plusCadence(candidate, params.schedule.cadence);
    guard += 1;
  }

  return candidate.isValid ? candidate.toJSDate() : null;
}

export async function syncReminderQueue(params: {
  db: PrismaClient | Prisma.TransactionClient;
  activity: Activity;
  schedule: ActivitySchedule;
}) {
  await params.db.activityReminder.deleteMany({
    where: {
      activityId: params.activity.id,
      scheduleId: params.schedule.id,
      status: "PENDING"
    }
  });

  if (!params.schedule.isEnabled || !params.schedule.nextDeadlineAt) {
    return;
  }

  const timezone = params.schedule.timezone || "Europe/Oslo";
  const nextDeadline = DateTime.fromJSDate(params.schedule.nextDeadlineAt, { zone: timezone });
  if (!nextDeadline.isValid) {
    return;
  }

  const reminderOffsetsMinutes = uniqueNumbers(params.schedule.reminderOffsetsMinutes);
  const reminderEmails = uniqueEmails(params.schedule.reminderEmails);

  if (reminderOffsetsMinutes.length === 0 || reminderEmails.length === 0) {
    return;
  }

  const now = DateTime.now().setZone(timezone);
  const rows: Prisma.ActivityReminderCreateManyInput[] = [];

  for (const email of reminderEmails) {
    for (const offset of reminderOffsetsMinutes) {
      const scheduledAt = nextDeadline.minus({ minutes: offset });
      if (scheduledAt < now.minus({ minutes: 1 })) {
        continue;
      }
      rows.push({
        activityId: params.activity.id,
        scheduleId: params.schedule.id,
        recipientEmail: email,
        scheduledFor: scheduledAt.toJSDate(),
        offsetMinutes: offset,
        status: "PENDING"
      });
    }
  }

  if (rows.length > 0) {
    await params.db.activityReminder.createMany({ data: rows });
  }
}
