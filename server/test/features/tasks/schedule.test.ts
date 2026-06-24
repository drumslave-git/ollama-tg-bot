import { describe, expect, it } from "vitest";
import {
  computeNextRun,
  describeSchedule,
  normalizeTimeOfDay,
  normalizeWeekdays,
  parseRunDate,
  type TaskSchedule,
} from "../../../src/features/tasks/schedule.js";

const DAY_MS = 86_400_000;

describe("tasks schedule helpers", () => {
  it("parses and normalizes time of day", () => {
    expect(normalizeTimeOfDay("9:5")).toBeNull();
    expect(normalizeTimeOfDay("9:05")).toBe("09:05");
    expect(normalizeTimeOfDay("17:00")).toBe("17:00");
    expect(normalizeTimeOfDay("24:00")).toBeNull();
    expect(normalizeTimeOfDay("12:60")).toBeNull();
  });

  it("parses run dates", () => {
    expect(parseRunDate("2026-06-24")).toEqual({ year: 2026, month: 6, day: 24 });
    expect(parseRunDate("2026-6-24")).toBeNull();
    expect(parseRunDate("nope")).toBeNull();
  });

  it("normalizes weekdays (dedupe, sort, clamp)", () => {
    expect(normalizeWeekdays([5, 1, 1, 9, -1, 3])).toEqual([1, 3, 5]);
  });
});

describe("computeNextRun — daily", () => {
  it("fires today when the time is still ahead (UTC)", () => {
    const schedule: TaskSchedule = { scheduleKind: "daily", timeOfDay: "09:00" };
    const from = new Date("2026-01-15T08:00:00Z");
    expect(computeNextRun(schedule, from, "UTC")).toBe("2026-01-15T09:00:00.000Z");
  });

  it("rolls to tomorrow when the time has passed (UTC)", () => {
    const schedule: TaskSchedule = { scheduleKind: "daily", timeOfDay: "09:00" };
    const from = new Date("2026-01-15T10:00:00Z");
    expect(computeNextRun(schedule, from, "UTC")).toBe("2026-01-16T09:00:00.000Z");
  });

  it("respects a timezone offset in winter (Europe/Berlin, UTC+1)", () => {
    const schedule: TaskSchedule = { scheduleKind: "daily", timeOfDay: "09:00" };
    // 08:00 Berlin local; 09:00 local is still ahead → 08:00Z.
    const from = new Date("2026-01-15T07:00:00Z");
    expect(computeNextRun(schedule, from, "Europe/Berlin")).toBe(
      "2026-01-15T08:00:00.000Z",
    );
  });

  it("respects a timezone offset in summer/DST (Europe/Berlin, UTC+2)", () => {
    const schedule: TaskSchedule = { scheduleKind: "daily", timeOfDay: "09:00" };
    // 09:00 Berlin summer = 07:00Z.
    const from = new Date("2026-07-15T05:00:00Z");
    expect(computeNextRun(schedule, from, "Europe/Berlin")).toBe(
      "2026-07-15T07:00:00.000Z",
    );
  });
});

describe("computeNextRun — weekly", () => {
  it("picks the next matching weekday after the current time", () => {
    const schedule: TaskSchedule = {
      scheduleKind: "weekly",
      timeOfDay: "10:00",
      weekdays: [1, 2, 3, 4, 5], // Mon..Fri
    };
    const from = new Date("2026-01-17T12:00:00Z"); // a Saturday
    const next = computeNextRun(schedule, from, "UTC");
    expect(next).not.toBeNull();
    const dt = new Date(next!);
    expect(dt.getUTCDay()).toBe(1); // Monday
    expect(dt.getTime()).toBeGreaterThan(from.getTime());
    expect(dt.getTime() - from.getTime()).toBeLessThan(7 * DAY_MS);
  });

  it("rolls a week ahead when today matches but the time has passed", () => {
    const from = new Date("2026-01-19T12:00:00Z"); // Monday, after 10:00
    const schedule: TaskSchedule = {
      scheduleKind: "weekly",
      timeOfDay: "10:00",
      weekdays: [1],
    };
    const next = computeNextRun(schedule, from, "UTC");
    expect(next).toBe("2026-01-26T10:00:00.000Z"); // next Monday
  });

  it("returns null with no weekdays", () => {
    const schedule: TaskSchedule = {
      scheduleKind: "weekly",
      timeOfDay: "10:00",
      weekdays: [],
    };
    expect(computeNextRun(schedule, new Date("2026-01-19T12:00:00Z"), "UTC")).toBeNull();
  });
});

describe("computeNextRun — once", () => {
  it("returns the instant for a future date", () => {
    const schedule: TaskSchedule = {
      scheduleKind: "once",
      timeOfDay: "10:00",
      runDate: "2026-06-25",
    };
    expect(computeNextRun(schedule, new Date("2026-06-24T12:00:00Z"), "UTC")).toBe(
      "2026-06-25T10:00:00.000Z",
    );
  });

  it("returns null when the date/time is already past", () => {
    const schedule: TaskSchedule = {
      scheduleKind: "once",
      timeOfDay: "10:00",
      runDate: "2026-06-24",
    };
    expect(
      computeNextRun(schedule, new Date("2026-06-24T11:00:00Z"), "UTC"),
    ).toBeNull();
  });
});

describe("describeSchedule", () => {
  it("summarizes each schedule kind", () => {
    expect(describeSchedule({ scheduleKind: "daily", timeOfDay: "17:00" })).toBe(
      "every day at 17:00",
    );
    expect(
      describeSchedule({
        scheduleKind: "weekly",
        timeOfDay: "18:00",
        weekdays: [1, 2, 3, 4, 5],
      }),
    ).toBe("every Mon, Tue, Wed, Thu, Fri at 18:00");
    expect(
      describeSchedule({
        scheduleKind: "once",
        timeOfDay: "10:00",
        runDate: "2026-06-25",
      }),
    ).toBe("once on 2026-06-25 at 10:00");
  });
});
