import { DateTime } from "luxon";

export type SnapUnit = "none" | "day" | "week" | "month";

export interface TimeScaleOptions {
  startAt: string | Date;
  durationMonths: number;
  timezone: string;
  weekStartsOn?: 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

export interface TimeScale {
  startAt: Date;
  endAt: Date;
  totalMinutes: number;
  timezone: string;
  timeToAngle: (value: string | Date) => number;
  angleToTime: (angleRad: number) => Date;
  snapTime: (value: string | Date, unit: SnapUnit) => Date;
}

const FULL_CIRCLE = Math.PI * 2;

function parseInZone(value: string | Date, timezone: string): DateTime {
  if (value instanceof Date) {
    return DateTime.fromJSDate(value, { zone: timezone });
  }
  return DateTime.fromISO(value, { zone: timezone });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function createTimeScale(options: TimeScaleOptions): TimeScale {
  const weekStartsOn = options.weekStartsOn ?? 1;
  const start = parseInZone(options.startAt, options.timezone);

  if (!start.isValid) {
    throw new Error("Invalid startAt for time scale");
  }

  if (!Number.isInteger(options.durationMonths) || options.durationMonths <= 0) {
    throw new Error("durationMonths must be a positive integer");
  }

  const end = start.plus({ months: options.durationMonths });
  const totalMillis = end.toMillis() - start.toMillis();

  if (totalMillis <= 0) {
    throw new Error("Computed duration must be greater than zero");
  }

  const toAngle = (value: string | Date): number => {
    const dt = parseInZone(value, options.timezone);
    const ratio = (dt.toMillis() - start.toMillis()) / totalMillis;
    return clamp(ratio, 0, 1) * FULL_CIRCLE;
  };

  const toTime = (angleRad: number): Date => {
    const ratio = clamp(angleRad / FULL_CIRCLE, 0, 1);
    const millis = start.toMillis() + ratio * totalMillis;
    return DateTime.fromMillis(millis, { zone: options.timezone }).toJSDate();
  };

  const snapTime = (value: string | Date, unit: SnapUnit): Date => {
    const dt = parseInZone(value, options.timezone);

    if (!dt.isValid || unit === "none") {
      return dt.toJSDate();
    }

    if (unit === "day") {
      return dt.startOf("day").toJSDate();
    }

    if (unit === "month") {
      return dt.startOf("month").toJSDate();
    }

    if (unit === "week") {
      const daysSinceWeekStart = (dt.weekday - weekStartsOn + 7) % 7;
      return dt.minus({ days: daysSinceWeekStart }).startOf("day").toJSDate();
    }

    return dt.toJSDate();
  };

  return {
    startAt: start.toJSDate(),
    endAt: end.toJSDate(),
    totalMinutes: totalMillis / (1000 * 60),
    timezone: options.timezone,
    timeToAngle: toAngle,
    angleToTime: toTime,
    snapTime
  };
}
