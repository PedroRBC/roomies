import type { Expense } from "@/lib/api";
export type Period = "month" | "previous" | "quarter";
export type ExpenseScope = "shared" | "visible";
export const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export function periodWindow(period: Period, now = new Date()) {
  const y = now.getFullYear(),
    m = now.getMonth(),
    d = now.getDate();
  const from = new Date(
    y,
    m - (period === "previous" ? 1 : period === "quarter" ? 2 : 0),
    1,
  );
  const to = period === "previous" ? new Date(y, m, 0) : new Date(y, m, d);
  const previousFrom = new Date(
    from.getFullYear(),
    from.getMonth() - (period === "quarter" ? 3 : 1),
    1,
  );
  const previousLast = new Date(from.getFullYear(), from.getMonth(), 0);
  const previousTo =
    period === "previous"
      ? previousLast
      : new Date(
          previousLast.getFullYear(),
          previousLast.getMonth(),
          Math.min(d, previousLast.getDate()),
        );
  return {
    from: dateKey(from),
    to: dateKey(to),
    previousFrom: dateKey(previousFrom),
    previousTo: dateKey(previousTo),
  };
}
export interface ChartRow {
  name: string;
  cents: number;
}
function grouped(
  expenses: Expense[],
  key: (expense: Expense) => string,
  label = key,
): ChartRow[] {
  const groups = new Map<string, ChartRow>();
  for (const expense of expenses) {
    const id = key(expense);
    const group = groups.get(id) ?? { name: label(expense), cents: 0 };
    group.cents += Math.round(expense.amount * 100);
    groups.set(id, group);
  }
  return [...groups.values()].sort(
    (a, b) => b.cents - a.cents || a.name.localeCompare(b.name),
  );
}
export function dashboardMetrics(
  all: Expense[],
  period: Period,
  scope: ExpenseScope,
  now = new Date(),
) {
  const window = periodWindow(period, now);
  const visible = all.filter(
    (e) => scope === "visible" || e.visibility !== "private",
  );
  const expenses = visible
    .filter(
      (e) =>
        e.date.slice(0, 10) >= window.from && e.date.slice(0, 10) <= window.to,
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  const sum = (rows: Expense[]) =>
    rows.reduce((total, e) => total + Math.round(e.amount * 100), 0);
  const total = sum(expenses);
  const previousTotal = sum(
    visible.filter(
      (e) =>
        e.date.slice(0, 10) >= window.previousFrom &&
        e.date.slice(0, 10) <= window.previousTo,
    ),
  );
  const byDay = new Map(
    grouped(expenses, (e) => e.date.slice(0, 10)).map((row) => [
      row.name,
      row.cents,
    ]),
  );
  const daily: ChartRow[] = [];
  const [y, m, d] = window.from.split("-").map(Number);
  for (
    const day = new Date(y, m - 1, d);
    dateKey(day) <= window.to;
    day.setDate(day.getDate() + 1)
  ) {
    const name = dateKey(day);
    daily.push({ name, cents: byDay.get(name) ?? 0 });
  }
  const monthly = Array.from({ length: 6 }, (_, i) => {
    const name = dateKey(
      new Date(now.getFullYear(), now.getMonth() - 5 + i, 1),
    ).slice(0, 7);
    return {
      name,
      cents: sum(
        visible.filter(
          (e) => e.date.startsWith(name) && e.date.slice(0, 10) <= dateKey(now),
        ),
      ),
    };
  });
  return {
    ...window,
    expenses,
    total,
    previousTotal,
    change: previousTotal
      ? ((total - previousTotal) / previousTotal) * 100
      : null,
    daily,
    monthly,
    categories: grouped(expenses, (e) => e.category?.trim() ?? ""),
    payers: grouped(
      expenses,
      (e) => e.payer_id ?? e.payer_name,
      (e) => e.payer_name,
    ),
  };
}
