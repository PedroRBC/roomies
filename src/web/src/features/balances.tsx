import type { Balances as BalanceResponse } from "@/lib/api";
import { housePath } from "@/lib/features";
import type { FeatureProps } from "@/lib/features";
import { usePreferences } from "@/lib/preferences";
import { Card, CardContent } from "@/components/ui/card";
import { LoaderCircle, Wallet } from "lucide-react";
import { useFinanceResource } from "./finance-resource";
import { FinanceError } from "./finance-ui";

export function Balances(props: FeatureProps) {
  return <HouseBalances key={`${props.houseId}:${props.user.id}`} {...props} />;
}
function HouseBalances({ houseId, user, onUnauthorized }: FeatureProps) {
  const { t, money } = usePreferences();
  const { data, loading, error, reload } = useFinanceResource<BalanceResponse>(
    `${housePath(houseId)}/balances`,
    onUnauthorized,
  );
  const ownBalance = data?.balances.find((entry) => entry.user_id === user.id);
  return (
    <section
      aria-label={t("Balances", "Saldos", "Saldos")}
      className="space-y-5"
    >
      <h2 className="roomies-page-title">
        {t("Balances", "Saldos", "Saldos")}
      </h2>
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
            {ownBalance && (
              <Card role="region" aria-label={t("Your balance", "Seu saldo", "Tu saldo")} className="border-0 bg-primary text-primary-foreground shadow-none">
                <CardContent className="py-3">
                  <p className="flex items-center gap-2 text-sm"><Wallet className="size-4" aria-hidden="true" />{t("Your balance", "Seu saldo", "Tu saldo")}</p>
                  <p className="mt-3 break-words text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">{money(Math.abs(ownBalance.net))}</p>
                  <p className="mt-2 text-sm">{ownBalance.net < 0 ? t("You owe", "Você deve", "Debes") : ownBalance.net > 0 ? t("You are owed", "Você tem a receber", "Te deben") : t("You are all settled up", "Está tudo acertado", "Todo está saldado")}</p>
                </CardContent>
              </Card>
            )}
            {data.balances.map((entry) => (
              <article
                key={entry.user_id}
                className="rounded-[18px] border bg-card p-5 shadow-(--card-shadow)"
              >
                <h3 className="mb-2 pt-2 text-[19px] font-bold leading-normal tracking-[-0.1px]">
                  {entry.user_name}
                </h3>
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
