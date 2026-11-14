import type { Balances as BalanceResponse } from "@/lib/api";
import { housePath } from "@/lib/features";
import type { FeatureProps } from "@/lib/features";
import { usePreferences } from "@/lib/preferences";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
      className="grid gap-5"
    >
      <h2 className="font-heading text-2xl">
        {t("Balances", "Saldos", "Saldos")}
      </h2>
      <FinanceError error={error} retry={reload} />
      {loading ? (
        <p role="status">
          {t("Loading balances…", "Carregando saldos…", "Cargando saldos…")}
        </p>
      ) : (
        data &&
        (data.balances.length === 0 ? (
          <p>
            {t(
              "No expenses yet.",
              "Ainda não há despesas.",
              "Todavía no hay gastos.",
            )}
          </p>
        ) : (
          <>
            <Table aria-label={t("Balances", "Saldos", "Saldos")}>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">
                    {t("Member", "Membro", "Miembro")}
                  </TableHead>
                  <TableHead scope="col">
                    {t("Paid", "Pago", "Pagado")}
                  </TableHead>
                  <TableHead scope="col">
                    {t("Owed", "Devido", "Adeudado")}
                  </TableHead>
                  <TableHead scope="col">{t("Net", "Saldo", "Neto")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.balances.map((entry) => (
                  <TableRow key={entry.user_id}>
                    <TableHead scope="row">{entry.user_name}</TableHead>
                    <TableCell>{money(entry.paid)}</TableCell>
                    <TableCell>{money(entry.owed)}</TableCell>
                    <TableCell className="font-semibold">
                      {money(entry.net)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {(data.settlements ?? []).length > 0 && (
              <div className="grid gap-3">
                <h3 className="font-heading text-lg">
                  {t(
                    "Suggested settlements",
                    "Acertos sugeridos",
                    "Liquidaciones sugeridas",
                  )}
                </h3>
                {data.settlements.map((settlement) => (
                  <p
                    key={`${settlement.from_user_id}:${settlement.to_user_id}`}
                  >
                    {t(
                      `${settlement.from_user_name} pays ${settlement.to_user_name} ${money(settlement.amount)}`,
                      `${settlement.from_user_name} paga ${money(settlement.amount)} a ${settlement.to_user_name}`,
                      `${settlement.from_user_name} paga ${money(settlement.amount)} a ${settlement.to_user_name}`,
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
