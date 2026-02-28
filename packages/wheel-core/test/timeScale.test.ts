import { describe, expect, test } from "vitest";
import { DateTime } from "luxon";
import { createTimeScale } from "../src/timeScale";

describe("createTimeScale", () => {
  test("maps start to 0 and end to full circle", () => {
    const scale = createTimeScale({
      startAt: "2026-01-01T00:00:00",
      durationMonths: 12,
      timezone: "Europe/Oslo"
    });

    expect(scale.timeToAngle(scale.startAt)).toBe(0);
    expect(scale.timeToAngle(scale.endAt)).toBeCloseTo(Math.PI * 2, 8);
  });

  test("round-trips angle to time", () => {
    const scale = createTimeScale({
      startAt: "2026-01-01T00:00:00",
      durationMonths: 6,
      timezone: "Europe/Oslo"
    });

    const original = DateTime.fromISO("2026-03-20T12:00:00", {
      zone: "Europe/Oslo"
    }).toJSDate();

    const angle = scale.timeToAngle(original);
    const roundTrip = scale.angleToTime(angle);

    const diffMs = Math.abs(roundTrip.getTime() - original.getTime());
    expect(diffMs).toBeLessThanOrEqual(1);
  });

  test("snaps to week start", () => {
    const scale = createTimeScale({
      startAt: "2026-01-01T00:00:00",
      durationMonths: 12,
      timezone: "Europe/Oslo",
      weekStartsOn: 1
    });

    const value = DateTime.fromISO("2026-02-11T10:15:00", {
      zone: "Europe/Oslo"
    }).toJSDate();

    const snapped = DateTime.fromJSDate(scale.snapTime(value, "week"), {
      zone: "Europe/Oslo"
    });

    expect(snapped.weekday).toBe(1);
    expect(snapped.hour).toBe(0);
    expect(snapped.minute).toBe(0);
  });

  test("handles DST month span in Europe/Oslo", () => {
    const scale = createTimeScale({
      startAt: "2026-03-01T00:00:00",
      durationMonths: 1,
      timezone: "Europe/Oslo"
    });

    // March has DST shift; still needs valid positive duration and stable mapping.
    expect(scale.totalMinutes).toBeGreaterThan(0);

    const middle = DateTime.fromISO("2026-03-15T12:00:00", {
      zone: "Europe/Oslo"
    }).toJSDate();

    const angle = scale.timeToAngle(middle);
    expect(angle).toBeGreaterThan(0);
    expect(angle).toBeLessThan(Math.PI * 2);
  });
});
