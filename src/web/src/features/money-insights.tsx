import { usePreferences } from "@/lib/preferences";
import { housePath, type FeatureProps } from "@/lib/features";
import type { Expense } from "@/lib/api";
import { useFinanceResource } from "./finance-resource";
import { FinanceError } from "./finance-ui";
import DashboardInsights from "./dashboard-insights";
export function MoneyInsights(
  props: FeatureProps & { navigate: (path: string) => void },
) {
  const { t } = usePreferences();
  const resource = useFinanceResource<Expense[]>(
    `${housePath(props.houseId)}/expenses`,
    props.onUnauthorized,
  );
  return (
    <>
      <FinanceError error={resource.error} retry={resource.reload} />
      {resource.loading ? (
        <p role="status">
          {t("Loading spending…", "Carregando gastos…", "Cargando gastos…")}
        </p>
      ) : (
        resource.data && (
          <DashboardInsights
            expenses={resource.data}
            userId={props.user.id}
            houseId={props.houseId}
            navigate={props.navigate}
          />
        )
      )}
    </>
  );
}
