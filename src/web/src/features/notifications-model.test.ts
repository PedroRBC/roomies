import { describe, expect, it } from "vitest";
import {
  buildEventRequest,
  eventDraft,
  minutesTime,
  timeMinutes,
  validatePreferences,
} from "./notifications-model";

const draft = {
  title: " Rent ",
  start: "2026-12-01T09:30",
  timezone: "America/Sao_Paulo",
  frequency: "MONTHLY",
  interval: "1",
  count: "12",
  until: "",
  exdates: "2027-01-01T09:30",
  extras: "",
  enabled: true,
};
describe("scheduled event requests", () => {
  it("keeps wall clock times in the event timezone and normalizes exception seconds", () => {
    expect(buildEventRequest(draft)).toEqual({
      title: "Rent",
      timezone: "America/Sao_Paulo",
      dtstart_local: "2026-12-01T09:30:00",
      rrule: "FREQ=MONTHLY;INTERVAL=1;COUNT=12",
      exdates: ["2027-01-01T09:30:00"],
      enabled: true,
    });
  });
  it("round trips UTC until, recurrence qualifiers and disabled state without data loss", () => {
    const event = {
      title: "Rent",
      timezone: "Europe/Lisbon",
      dtstart_local: "2026-12-01T09:30:25",
      rrule:
        "FREQ=WEEKLY;INTERVAL=2;UNTIL=20270131T093000Z;BYDAY=MO,FR;WKST=MO",
      exdates: ["2026-12-04T09:30:25"],
      enabled: false,
    };
    expect(buildEventRequest(eventDraft(event))).toEqual(event);
  });
  it("converts a local until to RFC 5545 without applying the browser timezone", () => {
    expect(
      buildEventRequest({ ...draft, count: "", until: "2027-01-31T09:30" })
        .rrule,
    ).toBe("FREQ=MONTHLY;INTERVAL=1;UNTIL=20270131T093000");
  });
  it.each([
    { interval: "0" },
    { count: "367" },
    { count: "", until: "" },
    { timezone: "Mars/Base" },
    { start: "2026-02-30T12:00" },
    { exdates: "2026-12-01" },
    { count: "", until: "2026-11-30T09:30" },
  ])("rejects invalid recurrence input %j", (patch) => {
    expect(() => buildEventRequest({ ...draft, ...patch })).toThrow();
  });
});
describe("notification preferences", () => {
  const preferences = {
    expense_created_enabled: true,
    reminder_enabled: false,
    cadence: "daily_digest",
    timezone: "UTC",
    quiet_start_minutes: 1320,
    quiet_end_minutes: 420,
    digest_minutes: 480,
  };
  it("allows overnight quiet hours and clearing both endpoints", () => {
    expect(() => validatePreferences(preferences)).not.toThrow();
    expect(() =>
      validatePreferences({
        ...preferences,
        quiet_start_minutes: null,
        quiet_end_minutes: null,
      }),
    ).not.toThrow();
  });
  it.each([
    { quiet_end_minutes: null },
    { quiet_start_minutes: -1 },
    { digest_minutes: 1440 },
    { timezone: "invalid" },
    { cadence: "weekly" },
  ])("rejects invalid preferences %j", (patch) => {
    expect(() => validatePreferences({ ...preferences, ...patch })).toThrow();
  });
  it("round trips midnight and rejects invalid clock values", () => {
    expect(minutesTime(0)).toBe("00:00");
    expect(timeMinutes("23:59")).toBe(1439);
    expect(timeMinutes("24:00")).toBeNull();
    expect(timeMinutes("-1:30")).toBeNull();
    expect(timeMinutes("12:60")).toBeNull();
  });
});
it("reads case-insensitive RFC rules accepted by the API without dropping qualifiers", () => {
  const value = eventDraft({
    title: "Rent",
    timezone: "UTC",
    dtstart_local: "2026-12-01T09:00:00",
    rrule: "rrule:freq=weekly;count=3;byday=mo,fr",
    exdates: [],
    enabled: true,
  });
  expect(buildEventRequest(value).rrule).toBe(
    "FREQ=WEEKLY;INTERVAL=1;COUNT=3;BYDAY=MO,FR",
  );
});
