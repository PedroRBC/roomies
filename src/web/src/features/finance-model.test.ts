import { describe, expect, it } from "vitest";
import {
  expenseBody,
  parseMoneyCents,
  canCreate,
  canMutate,
  canChangeVisibility,
} from "./finance-model";
const members = [
  { user_id: "a", user_name: "Alex", role: "admin" },
  { user_id: "b", user_name: "Bea", role: "member" },
  { user_id: "c", user_name: "Cam", role: "member" },
  { user_id: "m", user_name: "Monitor", role: "monitor" },
];
const draft = {
  amount: "10.01",
  description: " Food ",
  category: " Home ",
  date: "2026-11-14",
  visibility: "shared" as const,
  recipients: [],
  splitMode: "equal" as const,
  shares: {},
};
describe("money at the API boundary", () => {
  it.each([
    ["0.01", 1],
    ["10,01", 1001],
    ["1.234,56", 123456],
    ["99999999.99", 9999999999],
  ])("parses %s exactly into cents", (text, cents) =>
    expect(parseMoneyCents(text)).toBe(cents),
  );
  it.each([
    "-1",
    "1.001",
    "1e3",
    "0x10",
    "Infinity",
    "NaN",
    "100000000",
    "1,2,3",
    "1.23,45",
    "",
  ])("rejects invalid money %s", (value) =>
    expect(parseMoneyCents(value)).toBeNull(),
  );
  it("lets the server distribute a new equal split, excluding monitor shares", () => {
    expect(expenseBody(draft, members)).toEqual({
      ok: true,
      value: {
        amount: 10.01,
        description: "Food",
        category: "Home",
        date: "2026-11-14",
        visibility: "shared",
        visible_to: [],
        split: [],
      },
    });
  });
  it("distributes replacement splits deterministically to the cent", () => {
    expect(expenseBody(draft, members, true)).toMatchObject({
      ok: true,
      value: {
        split: [
          { user_id: "a", amount: 3.34 },
          { user_id: "b", amount: 3.34 },
          { user_id: "c", amount: 3.33 },
        ],
      },
    });
  });
  it("requires custom split amounts to exactly equal the total", () => {
    expect(
      expenseBody(
        { ...draft, splitMode: "custom", shares: { a: "5", b: "5" } },
        members,
      ),
    ).toEqual({ ok: false, error: "splitTotal" });
    expect(
      expenseBody(
        { ...draft, splitMode: "custom", shares: { a: "5", b: "5.01" } },
        members,
      ),
    ).toMatchObject({ ok: true });
  });
  it("rejects monitor or removed split participants and zero shares", () => {
    for (const shares of [
      { m: "10.01" },
      { gone: "10.01" },
      { a: "0", b: "10.01" },
    ] as Record<string, string>[]) {
      expect(
        expenseBody({ ...draft, splitMode: "custom", shares }, members),
      ).toMatchObject({ ok: false });
    }
  });
  it("permits private visibility for monitors but never sends stale recipients for shared expenses", () => {
    expect(
      expenseBody(
        { ...draft, visibility: "private", recipients: ["m"] },
        members,
      ),
    ).toMatchObject({ ok: true, value: { visible_to: ["m"] } });
    expect(
      expenseBody({ ...draft, recipients: ["gone"] }, members),
    ).toMatchObject({ ok: true, value: { visible_to: [] } });
    expect(
      expenseBody(
        { ...draft, visibility: "private", recipients: ["gone"] },
        members,
      ),
    ).toEqual({ ok: false, error: "recipients" });
  });
  it("rejects invalid dates, blank descriptions, zero totals and impossible replacement equal splits", () => {
    expect(expenseBody({ ...draft, date: "2026-02-30" }, members)).toEqual({
      ok: false,
      error: "date",
    });
    expect(expenseBody({ ...draft, description: " " }, members)).toEqual({
      ok: false,
      error: "description",
    });
    expect(expenseBody({ ...draft, amount: "0" }, members)).toEqual({
      ok: false,
      error: "amount",
    });
    expect(
      expenseBody({ ...draft, amount: ".01" }, members, true),
    ).toMatchObject({ ok: false });
    expect(expenseBody({ ...draft, amount: "0.01" }, members, true)).toEqual({
      ok: false,
      error: "splitPositive",
    });
  });
  it("preserves historical splits when editing metadata", () => {
    const result = expenseBody({ ...draft, splitMode: "keep" }, members, true);
    expect(result).toEqual({
      ok: true,
      value: {
        amount: 10.01,
        description: "Food",
        category: "Home",
        date: "2026-11-14",
      },
    });
  });
});
describe("server permissions", () => {
  it("permits admin overrides and payer edits while denying monitor and unknown roles", () => {
    expect(canMutate("admin", false)).toBe(true);
    expect(canMutate("member", true)).toBe(true);
    expect(canMutate("member", false)).toBe(false);
    for (const role of ["monitor", "owner", null]) {
      expect(canCreate(role)).toBe(false);
      expect(canMutate(role, true)).toBe(false);
    }
  });
  it("keeps visibility payer-only, including against admin overrides", () => {
    expect(canChangeVisibility("admin", false)).toBe(false);
    expect(canChangeVisibility("member", true)).toBe(true);
    expect(canChangeVisibility("monitor", true)).toBe(false);
  });
});
