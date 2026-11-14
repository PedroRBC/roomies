import { describe, expect, it } from "vitest";
import { defaultEnd, localDateTime, schedule } from "./household-dates";

describe("household local dates", () => {
  it("normalizes wall-clock minutes without adding an offset", () => {
    expect(localDateTime("2026-11-20T08:30")).toBe("2026-11-20T08:30:00");
    expect(localDateTime("2026-11-20", true)).toBe("2026-11-20T00:00:00");
  });
  it.each([
    "2026-02-29T08:30",
    "2026-04-31T08:30",
    "2026-11-20T24:00",
    "2026-11-20T08:30Z",
    "2026-11-20",
    "",
  ])("rejects invalid local date %s", (value) => {
    expect(() => localDateTime(value)).toThrow("date");
  });
  it("adds across a year boundary without depending on device timezone", () => {
    expect(defaultEnd("2026-12-31T23:30", false)).toBe("2027-01-01T00:30");
    expect(defaultEnd("2028-02-28", true)).toBe("2028-02-29");
  });
  it("retains seconds when defaulting a calendar end time", () => {
    expect(defaultEnd("2026-11-20T08:30:45", false)).toBe(
      "2026-11-20T09:30:45",
    );
  });
  it("normalizes exception dates in the selected timezone while preserving bounded RFC recurrence", () => {
    expect(
      schedule(
        "America/Sao_Paulo",
        " rrule:freq=weekly;count=3 ",
        "2026-11-20T08:30\n2026-11-27T08:30:00",
      ),
    ).toEqual({
      timezone: "America/Sao_Paulo",
      rrule: "FREQ=WEEKLY;COUNT=3",
      exdates: ["2026-11-20T08:30:00", "2026-11-27T08:30:00"],
    });
  });
  it("rejects an invalid timezone before any request", () => {
    expect(() => schedule("Made/Up", "FREQ=WEEKLY;COUNT=1", "")).toThrow(
      "timezone",
    );
  });
  it.each([
    "FREQ=YEARLY;COUNT=1",
    "FREQ=WEEKLY",
    "FREQ=WEEKLY;COUNT=0",
    "FREQ=WEEKLY;COUNT=367",
    "FREQ=WEEKLY;COUNT=3;INTERVAL=0",
    "FREQ=WEEKLY;COUNT=3;BYHOUR=8",
  ])("rejects unsupported/unbounded recurrence %s", (rule) => {
    expect(() => schedule("UTC", rule, "")).toThrow("recurrence");
  });
  it("rejects excessive or invalid exception dates", () => {
    expect(() =>
      schedule(
        "UTC",
        "FREQ=WEEKLY;COUNT=1",
        Array(101).fill("2026-11-20T08:30").join("\n"),
      ),
    ).toThrow("exceptions");
    expect(() =>
      schedule("UTC", "FREQ=WEEKLY;COUNT=1", "2026-02-30T08:30"),
    ).toThrow("date");
  });
});
