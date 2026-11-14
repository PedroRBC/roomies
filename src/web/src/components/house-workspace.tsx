import { lazy, Suspense, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { House, Member, User } from "@/lib/api";
import type { FeatureProps } from "@/lib/features";
import { housePath } from "@/lib/features";
import { houseLink, type HouseTab } from "@/lib/navigation";
import { usePreferences } from "@/lib/preferences";
const Expenses = lazy(() =>
  import("@/features/expenses").then((module) => ({
    default: module.Expenses,
  })),
);
const Balances = lazy(() =>
  import("@/features/balances").then((module) => ({
    default: module.Balances,
  })),
);
const Notes = lazy(() =>
  import("@/features/notes").then((module) => ({ default: module.Notes })),
);
const Groceries = lazy(() =>
  import("@/features/household").then((module) => ({
    default: module.Groceries,
  })),
);
const Chores = lazy(() =>
  import("@/features/household").then((module) => ({ default: module.Chores })),
);
const Calendar = lazy(() =>
  import("@/features/household").then((module) => ({
    default: module.Calendar,
  })),
);
const Notifications = lazy(() =>
  import("@/features/notifications").then((module) => ({
    default: module.Notifications,
  })),
);
const MoneyInsights = lazy(() =>
  import("@/features/money-insights").then((m) => ({
    default: m.MoneyInsights,
  })),
);
import { Members } from "@/features/members";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
export function HouseWorkspace({
  house,
  user,
  tab = "expenses",
  onUnauthorized,
  onChanged,
  navigate,
  quick = false,
  createRequested = false,
}: {
  house: House;
  user: User;
  tab?: HouseTab;
  onUnauthorized: () => void;
  onChanged?: () => void;
  navigate?: (path: string) => void;
  quick?: boolean;
  createRequested?: boolean;
}) {
  const { t } = usePreferences();
  const [loaded, setLoaded] = useState<{
    house: House;
    members: Member[];
  } | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const base = housePath(house.id);
  useEffect(() => {
    let active = true;
    Promise.all([api<House>(base), api<Member[]>(`${base}/members`)])
      .then(([house, members]) => {
        if (active) setLoaded({ house, members });
      })
      .catch((err: ApiError) => {
        if (active) {
          setError(err.message);
          if (err.status === 401) onUnauthorized();
        }
      });
    return () => {
      active = false;
    };
  }, [base, revision, onUnauthorized]);
  if (error)
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {error}
          <Button
            className="ml-3"
            variant="outline"
            onClick={() => {
              setError("");
              setRevision((value) => value + 1);
            }}
          >
            {t("Retry", "Tentar novamente", "Reintentar")}
          </Button>
        </AlertDescription>
      </Alert>
    );
  if (!loaded)
    return (
      <p role="status">
        {t(
          "Loading your household…",
          "Carregando sua casa…",
          "Cargando tu casa…",
        )}
      </p>
    );
  const props: FeatureProps = {
    quickCreate: createRequested,
    houseId: house.id,
    user,
    members: loaded.members,
    role:
      loaded.members.find((member) => member.user_id === user.id)?.role ?? null,
    onUnauthorized,
    onChanged: () => {
      if (tab === "members") {
        setRevision((value) => value + 1);
        onChanged?.();
      }
    },
  };
  const sections = {
    expenses: Expenses,
    balances: Balances,
    notes: Notes,
    groceries: Groceries,
    chores: Chores,
    calendar: Calendar,
    notifications: Notifications,
    members: Members,
  };
  const Section = sections[tab];
  const money = tab === "expenses" || tab === "balances";
  const management = tab === "members" || tab === "notifications";
  const tabs: { tab: HouseTab; label: string }[] = money
    ? [
        { tab: "expenses", label: t("Ledger", "Extrato", "Registro") },
        {
          tab: "balances",
          label: t("Settle up", "Acertar contas", "Ajustar cuentas"),
        },
      ]
    : [
        {
          tab: "groceries",
          label: t("Shopping list", "Lista de compras", "Lista de compras"),
        },
        { tab: "chores", label: t("Chores", "Tarefas", "Tareas") },
        { tab: "calendar", label: t("Calendar", "Calendário", "Calendario") },
        { tab: "notes", label: t("Noticeboard", "Mural", "Tablón") },
      ];
  return (
    <section aria-label={loaded.house.name} className="grid min-w-0 gap-7">
      {!management && !quick && (
        <>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-heading text-3xl font-semibold">
                {money
                  ? t("Money", "Dinheiro", "Dinero")
                  : t("Household", "Casa", "Casa")}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {money
                  ? t(
                      "Record a cost. Check your balance. Get back to your day.",
                      "Registre um gasto. Confira seu saldo. Siga seu dia.",
                      "Registra un gasto. Consulta tu saldo. Sigue con tu día.",
                    )
                  : t(
                      "The everyday things, together in one place.",
                      "As coisas do dia a dia, juntas em um só lugar.",
                      "Las cosas de cada día, juntas en un lugar.",
                    )}
              </p>
            </div>
          </div>
          <nav
            aria-label={t(
              "Workspace sections",
              "Seções do espaço",
              "Secciones del espacio",
            )}
            className="flex flex-wrap gap-1 border-b pb-3"
          >
            {tabs.map((item) => (
              <Button
                key={item.tab}
                variant={item.tab === tab ? "secondary" : "ghost"}
                aria-current={item.tab === tab ? "page" : undefined}
                onClick={() => navigate?.(houseLink(house.id, item.tab))}
              >
                {item.label}
              </Button>
            ))}
          </nav>
        </>
      )}
      <Suspense
        fallback={
          <p role="status">
            {t("Loading section…", "Carregando seção…", "Cargando sección…")}
          </p>
        }
      >
        {money && !quick && (
          <details
            onToggle={(event) => setInsightsOpen(event.currentTarget.open)}
            className="border-t pt-5"
          >
            <summary className="cursor-pointer font-semibold">
              {t(
                "Explore spending trends",
                "Explorar tendências de gastos",
                "Explorar tendencias de gastos",
              )}
            </summary>
            <div className="pt-5">
              {insightsOpen && (
                <MoneyInsights {...props} navigate={navigate ?? (() => {})} />
              )}
            </div>
          </details>
        )}
        <Section key={tab} {...props} />
      </Suspense>
    </section>
  );
}
