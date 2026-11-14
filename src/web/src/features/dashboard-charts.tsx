import { useState } from "react";
import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePreferences } from "@/lib/preferences";
import type { ChartRow } from "./dashboard-model";

export function DashboardChart({
  title,
  rows,
  horizontal = false,
  count = false,
  children,
  label,
}: {
  title: string;
  rows: ChartRow[];
  horizontal?: boolean;
  count?: boolean;
  children?: ReactNode;
  label?: (value: string) => string;
}) {
  const { t, money, locale, currency } = usePreferences();
  const format = (value: number) =>
    count ? value.toLocaleString(locale) : money(value / 100);
  const compact = (value: number) =>
    new Intl.NumberFormat(locale === "pt" ? "pt-BR" : locale, {
      notation: "compact",
      maximumFractionDigits: 1,
      ...(count ? {} : { style: "currency", currency }),
    }).format(count ? value : value / 100);
  const data = rows.map((row) => ({
    ...row,
    name: label?.(row.name) ?? row.name,
  }));
  const config = {
    cents: {
      label: count
        ? t("Completions", "Conclusões", "Finalizaciones")
        : t("Recorded spending", "Gastos registrados", "Gastos registrados"),
      color: "var(--chart-1)",
    },
  };
  const empty = !rows.some((row) => row.cents !== 0);
  return (
    <Card className="min-w-0 gap-3">
      <CardHeader>
        <CardTitle className="font-sans text-base font-semibold">
          {title}
        </CardTitle>
        {children}
      </CardHeader>
      <CardContent>
        {empty ? (
          <p className="py-8 text-sm text-muted-foreground">
            {t(
              "No records for this period. Add activity to see it here.",
              "Nenhum registro neste período. Adicione atividades para vê-las aqui.",
              "No hay registros en este período. Añade actividad para verla aquí.",
            )}
          </p>
        ) : (
          <>
            <ChartContainer
              config={config}
              className="h-[240px] w-full aspect-auto [&_.recharts-surface:focus-visible]:outline-2 [&_.recharts-surface:focus-visible]:outline-ring"
              role="group"
              aria-label={title}
            >
              {horizontal ? (
                <BarChart
                  accessibilityLayer
                  data={data}
                  layout="vertical"
                  margin={{ left: 0, right: 65 }}
                >
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" tickFormatter={format} hide />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={105}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value) =>
                      String(value).length > 16
                        ? `${String(value).slice(0, 15)}…`
                        : String(value)
                    }
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => format(Number(value))}
                      />
                    }
                  />
                  <Bar
                    dataKey="cents"
                    fill="var(--color-cents)"
                    radius={4}
                    maxBarSize={28}
                    isAnimationActive={false}
                  >
                    <LabelList
                      dataKey="cents"
                      position="right"
                      formatter={(value) => compact(Number(value))}
                      className="fill-foreground"
                    />
                  </Bar>
                </BarChart>
              ) : (
                <AreaChart
                  accessibilityLayer
                  data={data}
                  margin={{ left: 0, right: 10 }}
                >
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="name"
                    minTickGap={24}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value) => String(value).slice(5)}
                  />
                  <YAxis
                    width={65}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={compact}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => format(Number(value))}
                      />
                    }
                  />
                  <Area
                    type="linear"
                    dataKey="cents"
                    stroke="var(--color-cents)"
                    fill="var(--color-cents)"
                    fillOpacity={0.16}
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                </AreaChart>
              )}
            </ChartContainer>
            <details className="mt-3 text-sm">
              <summary className="w-fit cursor-pointer rounded-sm text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
                {t("View data", "Ver dados", "Ver datos")}
              </summary>
              <div className="max-h-64 overflow-auto pt-3">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">{title}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t("Record", "Registro", "Registro")}</th>
                      <th scope="col" className="text-right">
                        {count
                          ? t("Count", "Quantidade", "Cantidad")
                          : t("Amount", "Valor", "Importe")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row, i) => (
                      <tr key={i} className="border-t">
                        <th scope="row" className="py-2 font-normal">
                          {row.name}
                        </th>
                        <td className="text-right tabular-nums">
                          {format(row.cents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function SpendingAreaChart({
  expenses,
}: {
  expenses: import("@/lib/api").Expense[];
}) {
  const { t, locale, money } = usePreferences();
  const [range, setRange] = useState<"7d" | "30d" | "90d">("30d");
  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  const [end] = useState(() => {
    const value = new Date();
    value.setHours(0, 0, 0, 0);
    return value;
  });
  const start = new Date(end);
  start.setDate(start.getDate() - days + 1);
  const centsByDate = new Map<string, number>();
  for (const expense of expenses) {
    if (expense.visibility === "private") continue;
    const key = expense.date.slice(0, 10);
    centsByDate.set(
      key,
      (centsByDate.get(key) ?? 0) + Math.round(expense.amount * 100),
    );
  }
  const data = Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = date.toISOString().slice(0, 10);
    return { date: key, spending: centsByDate.get(key) ?? 0 };
  });
  const hasSpending = data.some((item) => item.spending > 0);
  const config = {
    spending: {
      label: t(
        "Shared spending",
        "Gastos compartilhados",
        "Gastos compartidos",
      ),
      color: "var(--chart-1)",
    },
  } satisfies import("@/components/ui/chart").ChartConfig;
  return (
    <Card className="gap-0 overflow-hidden pt-0">
      <CardHeader className="flex flex-wrap items-start gap-3 border-b py-5 sm:flex-row sm:items-center">
        <div className="grid flex-1 gap-1">
          <CardTitle className="font-sans text-base font-semibold">
            {t(
              "Spending over time",
              "Gastos ao longo do tempo",
              "Gastos a lo largo del tiempo",
            )}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {t(
              "Shared expenses recorded each day",
              "Despesas compartilhadas registradas por dia",
              "Gastos compartidos registrados por día",
            )}
          </p>
        </div>
        <Select
          value={range}
          onValueChange={(value) => value && setRange(value as typeof range)}
        >
          <SelectTrigger
            className="w-[150px]"
            aria-label={t(
              "Spending range",
              "Período dos gastos",
              "Período de gastos",
            )}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">
              {t("Last 7 days", "Últimos 7 dias", "Últimos 7 días")}
            </SelectItem>
            <SelectItem value="30d">
              {t("Last 30 days", "Últimos 30 dias", "Últimos 30 días")}
            </SelectItem>
            <SelectItem value="90d">
              {t("Last 90 days", "Últimos 90 dias", "Últimos 90 días")}
            </SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {!hasSpending ? (
          <p className="py-12 text-sm text-muted-foreground">
            {t(
              "No shared spending in this range.",
              "Nenhum gasto compartilhado neste período.",
              "No hay gastos compartidos en este período.",
            )}
          </p>
        ) : (
          <ChartContainer
            config={config}
            className="h-[280px] w-full aspect-auto"
            role="img"
            aria-label={t(
              "Shared spending over time",
              "Gastos compartilhados ao longo do tempo",
              "Gastos compartidos a lo largo del tiempo",
            )}
          >
            <AreaChart
              accessibilityLayer
              data={data}
              margin={{ left: 8, right: 12 }}
            >
              <defs>
                <linearGradient id="fillSpending" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-spending)"
                    stopOpacity={0.75}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-spending)"
                    stopOpacity={0.08}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={28}
                tickFormatter={(value) =>
                  new Date(`${value}T00:00:00`).toLocaleDateString(locale, {
                    month: "short",
                    day: "numeric",
                  })
                }
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(value) =>
                      new Date(`${value}T00:00:00`).toLocaleDateString(locale, {
                        month: "short",
                        day: "numeric",
                      })
                    }
                    formatter={(value) => money(Number(value) / 100)}
                    indicator="dot"
                  />
                }
              />
              <Area
                type="natural"
                dataKey="spending"
                stroke="var(--color-spending)"
                fill="url(#fillSpending)"
                strokeWidth={2}
                isAnimationActive={false}
              />
              <ChartLegend content={<ChartLegendContent />} />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
