import { useState } from "react";
import type { Balances, Expense, Member } from "@/lib/api";
import { usePreferences } from "@/lib/preferences";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Choice } from "@/components/choice";
import { DashboardChart } from "./dashboard-charts";
import {
  dashboardMetrics,
  type ExpenseScope,
  type Period,
} from "./dashboard-model";

export interface Completion {
  completed_by: string;
  completed_at: string;
}
export interface GroceryStatus {
  checked: boolean;
  assignee_id?: string | null;
}
export default function DashboardInsights({
  expenses,
}: {
  expenses: Expense[];
  balances?: Balances;
  groceries?: GroceryStatus[];
  completions?: Completion[];
  members?: Member[];
  userId: string;
  houseId: string;
  navigate: (path: string) => void;
}) {
  const { t, money, currency } = usePreferences();
  const [period, setPeriod] = useState<Period>("month");
  const [scope, setScope] = useState<ExpenseScope>("shared");
  const metrics = dashboardMetrics(expenses, period, scope);
  const category = (name: string) =>
    name || t("Uncategorized", "Sem categoria", "Sin categoría");
  return (
    <div className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Choice
          label={t(
            "Spending period",
            "Período dos gastos",
            "Período de gastos",
          )}
          value={period}
          onChange={(v) => setPeriod(v as Period)}
          choices={[
            {
              value: "month",
              label: t(
                "This month so far",
                "Este mês até hoje",
                "Este mes hasta hoy",
              ),
            },
            {
              value: "previous",
              label: t("Last month", "Mês passado", "Mes pasado"),
            },
            {
              value: "quarter",
              label: t(
                "Last 3 months so far",
                "Últimos 3 meses até hoje",
                "Últimos 3 meses hasta hoy",
              ),
            },
          ]}
        />
        <Choice
          label={t("Expense scope", "Escopo das despesas", "Alcance de gastos")}
          value={scope}
          onChange={(v) => setScope(v as ExpenseScope)}
          choices={[
            {
              value: "shared",
              label: t(
                "Shared expenses",
                "Despesas compartilhadas",
                "Gastos compartidos",
              ),
            },
            {
              value: "visible",
              label: t(
                "All expenses visible to me",
                "Todas as despesas visíveis para mim",
                "Todos los gastos visibles para mí",
              ),
            },
          ]}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        {metrics.from} – {metrics.to}.{" "}
        {t(
          `Displayed in ${currency}; currency preferences do not convert recorded amounts.`,
          `Exibido em ${currency}; a preferência de moeda não converte os valores registrados.`,
          `Mostrado en ${currency}; la preferencia de moneda no convierte los importes registrados.`,
        )}
      </p>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 border-y py-4">
        <h2 className="text-sm">
          {t("Recorded spending", "Gastos registrados", "Gastos registrados")}
        </h2>
        <span className="text-2xl font-semibold tabular-nums">
          {money(metrics.total / 100)}
        </span>
        <span className="text-sm text-muted-foreground">
          {metrics.change === null
            ? t(
                "No previous spending to compare",
                "Sem gastos anteriores para comparar",
                "Sin gastos anteriores para comparar",
              )
            : `${metrics.change > 0 ? "+" : ""}${metrics.change.toFixed(1)}%`}
        </span>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <DashboardChart
          title={t("Spending by day", "Gastos por dia", "Gastos por día")}
          rows={metrics.daily}
        />
        <DashboardChart
          title={t(
            "Six-month spending",
            "Gastos em seis meses",
            "Gastos de seis meses",
          )}
          rows={metrics.monthly}
        >
          <p className="text-sm text-muted-foreground">
            {t(
              "Recorded totals; current month is incomplete.",
              "Totais registrados; o mês atual está incompleto.",
              "Totales registrados; el mes actual está incompleto.",
            )}
          </p>
        </DashboardChart>
        <DashboardChart
          title={t(
            "Spending by category",
            "Gastos por categoria",
            "Gastos por categoría",
          )}
          rows={metrics.categories.slice(0, 8)}
          label={category}
          horizontal
        >
          <p className="text-sm text-muted-foreground">
            {t(
              "Top 8 categories for this period",
              "8 maiores categorias neste período",
              "8 categorías principales del período",
            )}
          </p>
        </DashboardChart>
      </div>
      <Card className="gap-3">
        <CardHeader>
          <CardTitle className="font-sans text-base font-semibold">
            {t("Recent expenses", "Despesas recentes", "Gastos recientes")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {metrics.expenses.length ? (
            <ul
              aria-label={t(
                "Recent expenses",
                "Despesas recentes",
                "Gastos recientes",
              )}
            >
              {metrics.expenses.slice(0, 3).map((e) => (
                <li
                  key={e.id}
                  className="flex justify-between gap-3 border-b py-3 last:border-0"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">
                      {e.description}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {e.date.slice(0, 10)} · {e.payer_name}
                    </span>
                  </span>
                  <span className="tabular-nums">{money(e.amount)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t(
                "No expenses in this period.",
                "Nenhuma despesa neste período.",
                "No hay gastos en este período.",
              )}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
