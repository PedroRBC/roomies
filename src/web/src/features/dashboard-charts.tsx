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
} from "@/components/ui/chart";
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
