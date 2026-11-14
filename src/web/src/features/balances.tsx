import type { Balances as BalanceResponse } from "@/lib/api";
import { housePath } from "@/lib/features";
import type { FeatureProps } from "@/lib/features";
import { usePreferences } from "@/lib/preferences";
import { LoaderCircle } from "lucide-react";
import { useFinanceResource } from "./finance-resource";
import { FinanceError } from "./finance-ui";

export function Balances(props: FeatureProps) {
  return <HouseBalances key={`${props.houseId}:${props.user.id}`} {...props} />;
}
function HouseBalances({ houseId, onUnauthorized }: FeatureProps) {
  const { t, money } = usePreferences();
  const { data, loading, error, reload } = useFinanceResource<BalanceResponse>(
    `${housePath(houseId)}/balances`,
    onUnauthorized,
  );
  return (
    <section
      aria-label={t("Balances", "Saldos", "Saldos")}
      className="space-y-5"
    >
      <h2 className="font-heading text-2xl font-semibold">
        {t("Balances", "Saldos", "Saldos")}
      </h2>
      <p className="text-sm text-muted-foreground">
        {t(
          "Suggested transfers from shared expenses. Payments are not recorded.",
          "Transferências sugeridas pelas despesas compartilhadas. Pagamentos não são registrados.",
          "Transferencias sugeridas por gastos compartidos. Los pagos no se registran.",
        )}
      </p>
      <FinanceError error={error} retry={reload} />
      {loading ? (
        <div role="status" className="flex justify-center py-8">
          <LoaderCircle
            aria-hidden="true"
            className="size-7 animate-spin text-primary"
          />
          <span className="sr-only">
            {t("Loading balances…", "Carregando saldos…", "Cargando saldos…")}
          </span>
        </div>
      ) : (
        data &&
        (data.balances.length === 0 ? (
          <p>
            {t(
              "No expenses yet.",
              "Nenhuma despesa ainda.",
              "Aún no hay gastos.",
            )}
          </p>
        ) : (
          <>
            {data.balances.map((entry) => (
              <article
                key={entry.user_id}
                className="flex flex-wrap items-baseline justify-between gap-3 border-b py-3"
              >
                <h3 className="font-semibold">{entry.user_name}</h3>
                <p className="text-muted-foreground">
                  {t(
                    `Paid ${money(entry.paid)}; owed ${money(entry.owed)}; net ${money(entry.net)}`,
                    `Pagou ${money(entry.paid)}; deve ${money(entry.owed)}; líquido ${money(entry.net)}`,
                    `Pagó ${money(entry.paid)}; debe ${money(entry.owed)}; neto ${money(entry.net)}`,
                  )}
                </p>
              </article>
            ))}
            {(data.settlements ?? []).length > 0 && (
              <div className="grid gap-3 text-muted-foreground">
                {data.settlements.map((settlement) => (
                  <p
                    key={`${settlement.from_user_id}:${settlement.to_user_id}`}
                  >
                    {t(
                      `${settlement.from_user_name} pays ${settlement.to_user_name} ${money(settlement.amount)}`,
                      `${settlement.from_user_name} paga ${settlement.to_user_name} ${money(settlement.amount)}`,
                      `${settlement.from_user_name} paga a ${settlement.to_user_name} ${money(settlement.amount)}`,
                    )}
                  </p>
                ))}
              </div>
            )}
          </>
        ))
      )}
    </section>
  );
}
