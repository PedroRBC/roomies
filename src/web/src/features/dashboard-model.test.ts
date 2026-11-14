import { expect, it } from "vitest";
import { dashboardMetrics, periodWindow } from "./dashboard-model";
import type { Expense } from "@/lib/api";
const expense = (
  amount: number,
  date: string,
  extra: Partial<Expense> = {},
): Expense => ({
  id: date,
  amount,
  date,
  category: "food",
  description: "Food",
  payer_name: "Alex",
  visibility: "shared",
  ...extra,
});
it("uses local calendar days and compares month to date with the same elapsed days", () => {
  const period = periodWindow("month", new Date(2024, 2, 31, 12));
  expect(period).toMatchObject({
    from: "2024-03-01",
    to: "2024-03-31",
    previousFrom: "2024-02-01",
    previousTo: "2024-02-29",
  });
  expect(periodWindow("previous", new Date(2026, 0, 15))).toMatchObject({
    from: "2025-12-01",
    to: "2025-12-31",
    previousFrom: "2025-11-01",
    previousTo: "2025-11-30",
  });
});
it("sums cents, excludes private and future spending, and keeps distinct payers with the same name", () => {
  const rows = [
    expense(0.1, "2026-11-01", { payer_id: "a" }),
    expense(0.2, "2026-11-01", { payer_id: "b" }),
    expense(999, "2026-11-02", { visibility: "private" }),
    expense(500, "2026-11-20"),
    expense(0.15, "2026-10-01"),
  ];
  const result = dashboardMetrics(
    rows,
    "month",
    "shared",
    new Date(2026, 10, 14),
  );
  expect(result.total).toBe(30);
  expect(result.previousTotal).toBe(15);
  expect(result.change).toBe(100);
  expect(result.daily[0].cents).toBe(30);
  expect(result.payers).toHaveLength(2);
  expect(result.categories[0].cents).toBe(30);
  expect(result.expenses).toHaveLength(2);
  expect(
    dashboardMetrics(rows, "month", "visible", new Date(2026, 10, 14)).total,
  ).toBe(99930);
});
it("zero-fills leap days, handles missing comparisons and groups uncategorized expenses", () => {
  const result = dashboardMetrics(
    [expense(1, "2024-02-29", { category: "" })],
    "month",
    "shared",
    new Date(2024, 1, 29),
  );
  expect(result.daily).toHaveLength(29);
  expect(result.daily[28].cents).toBe(100);
  expect(result.change).toBeNull();
  expect(result.categories[0].name).toBe("");
  expect(result.monthly).toHaveLength(6);
});
