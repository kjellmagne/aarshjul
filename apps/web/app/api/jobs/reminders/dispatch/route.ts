import { ScheduleCadence } from "@prisma/client";
import { DateTime } from "luxon";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { sendReminderEmail } from "@/lib/email";
import { computeNextDeadline, syncReminderQueue } from "@/lib/reminders";

export async function POST(request: Request) {
  const jobSecret = process.env.REMINDER_JOB_SECRET;
  if (!jobSecret) {
    return NextResponse.json({ error: "REMINDER_JOB_SECRET is not configured" }, { status: 500 });
  }

  const requestSecret = request.headers.get("x-job-secret");
  if (requestSecret !== jobSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const due = await prisma.activityReminder.findMany({
    where: {
      status: "PENDING",
      scheduledFor: { lte: now }
    },
    include: {
      activity: {
        include: {
          wheel: true,
          schedule: true
        }
      }
    },
    orderBy: { scheduledFor: "asc" },
    take: 100
  });

  let sent = 0;
  let failed = 0;
  const touchedSchedules = new Set<string>();

  for (const reminder of due) {
    try {
      const deadlineLabel = reminder.activity.schedule?.nextDeadlineAt
        ? DateTime.fromJSDate(reminder.activity.schedule.nextDeadlineAt, {
            zone: reminder.activity.schedule.timezone
          }).toFormat("dd.LL.yyyy HH:mm")
        : "ukjent frist";

      await sendReminderEmail({
        to: reminder.recipientEmail,
        subject: `Påminnelse: ${reminder.activity.title}`,
        text: [
          `Aktivitet: ${reminder.activity.title}`,
          `Hjul: ${reminder.activity.wheel.title}`,
          `Frist: ${deadlineLabel}`,
          `Tidspunkt: ${DateTime.fromJSDate(reminder.scheduledFor).toISO()}`
        ].join("\n")
      });

      await prisma.activityReminder.update({
        where: { id: reminder.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          errorMessage: null
        }
      });
      sent += 1;
      if (reminder.scheduleId) {
        touchedSchedules.add(reminder.scheduleId);
      }
    } catch (error) {
      await prisma.activityReminder.update({
        where: { id: reminder.id },
        data: {
          status: "FAILED",
          errorMessage: error instanceof Error ? error.message : "Unknown error"
        }
      });
      failed += 1;
    }
  }

  for (const scheduleId of touchedSchedules) {
    const schedule = await prisma.activitySchedule.findUnique({
      where: { id: scheduleId },
      include: { activity: true }
    });

    if (!schedule || !schedule.nextDeadlineAt) {
      continue;
    }

    if (
      schedule.cadence !== ScheduleCadence.DAILY &&
      schedule.cadence !== ScheduleCadence.WEEKLY &&
      schedule.cadence !== ScheduleCadence.MONTHLY
    ) {
      continue;
    }

    const nowInZone = DateTime.now().setZone(schedule.timezone);
    const nextDeadline = DateTime.fromJSDate(schedule.nextDeadlineAt, { zone: schedule.timezone });
    if (nextDeadline > nowInZone) {
      continue;
    }

    const updatedSchedule = await prisma.activitySchedule.update({
      where: { id: schedule.id },
      data: {
        nextDeadlineAt: computeNextDeadline({
          schedule: {
            cadence: schedule.cadence,
            deadlineAt: schedule.deadlineAt,
            timezone: schedule.timezone
          },
          now: nowInZone
        }),
        lastComputedAt: new Date()
      }
    });

    await syncReminderQueue({
      db: prisma,
      activity: schedule.activity,
      schedule: updatedSchedule
    });
  }

  return NextResponse.json({
    scanned: due.length,
    sent,
    failed
  });
}
