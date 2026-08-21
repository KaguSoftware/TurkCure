import { describe, it, expect } from "vitest";
import { dueAtBusinessHour, parseDateOnly, istanbulToday, isReminderOverdue } from "./dates";

describe("dueAtBusinessHour", () => {
  it("lands on 09:00 Istanbul of the given calendar day", () => {
    expect(dueAtBusinessHour("2026-08-21")).toBe("2026-08-21T09:00:00+03:00");
    // The instant is 06:00 UTC, never midnight.
    expect(new Date(dueAtBusinessHour("2026-08-21")).toISOString()).toBe(
      "2026-08-21T06:00:00.000Z"
    );
  });

  it("applies day offsets across month and year boundaries", () => {
    expect(dueAtBusinessHour("2026-08-31", 1)).toBe("2026-09-01T09:00:00+03:00");
    expect(dueAtBusinessHour("2026-12-25", 7)).toBe("2027-01-01T09:00:00+03:00");
    expect(dueAtBusinessHour("2026-03-01", -1)).toBe("2026-02-28T09:00:00+03:00");
  });
});

describe("parseDateOnly", () => {
  it("parses as LOCAL midnight, so the displayed day never shifts", () => {
    const d = parseDateOnly("2026-08-21");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(21);
    expect(d.getHours()).toBe(0);
  });
});

describe("istanbulToday", () => {
  it("rolls the day at Istanbul midnight (21:00 UTC)", () => {
    expect(istanbulToday(Date.parse("2026-08-21T20:59:00Z"))).toBe("2026-08-21");
    expect(istanbulToday(Date.parse("2026-08-21T21:00:00Z"))).toBe("2026-08-22");
  });
});

describe("isReminderOverdue", () => {
  const businessDue = "2026-08-21T09:00:00+03:00";

  it("gives date-derived reminders (09:00 TRT) end-of-day grace", () => {
    // Later the same Istanbul day: not overdue yet.
    expect(isReminderOverdue(businessDue, Date.parse("2026-08-21T15:00:00+03:00"))).toBe(false);
    expect(isReminderOverdue(businessDue, Date.parse("2026-08-21T23:59:00+03:00"))).toBe(false);
    // Past Istanbul midnight: overdue.
    expect(isReminderOverdue(businessDue, Date.parse("2026-08-22T00:01:00+03:00"))).toBe(true);
  });

  it("treats hand-picked times as overdue past the instant", () => {
    const snoozed = "2026-08-21T14:37:00+03:00";
    expect(isReminderOverdue(snoozed, Date.parse("2026-08-21T14:36:00+03:00"))).toBe(false);
    expect(isReminderOverdue(snoozed, Date.parse("2026-08-21T14:38:00+03:00"))).toBe(true);
  });

  it("handles Postgres-style +00:00 timestamps", () => {
    // 06:00Z == 09:00 TRT — still business-hour semantics.
    const pg = "2026-08-21T06:00:00+00:00";
    expect(isReminderOverdue(pg, Date.parse("2026-08-21T18:00:00Z"))).toBe(false);
    expect(isReminderOverdue(pg, Date.parse("2026-08-22T05:00:00Z"))).toBe(true);
  });

  it("never flags an unparseable value", () => {
    expect(isReminderOverdue("not-a-date", Date.now())).toBe(false);
  });
});
