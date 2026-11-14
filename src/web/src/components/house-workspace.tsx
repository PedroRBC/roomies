import { lazy, Suspense, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { House, Member, User } from "@/lib/api";
import type { FeatureProps } from "@/lib/features";
import { housePath } from "@/lib/features";
import type { HouseTab } from "@/lib/navigation";
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
import { Members } from "@/features/members";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
export function HouseWorkspace({
  house,
  user,
  tab = "expenses",
  onUnauthorized,
  onChanged,
}: {
  house: House;
  user: User;
  tab?: HouseTab;
  onUnauthorized: () => void;
  onChanged?: () => void;
}) {
  const { t } = usePreferences();
  const [loaded, setLoaded] = useState<{
    house: House;
    members: Member[];
  } | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
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
  return (
    <section aria-label={loaded.house.name} className="grid gap-7">
      <Suspense
        fallback={
          <p role="status">
            {t("Loading section…", "Carregando seção…", "Cargando sección…")}
          </p>
        }
      >
        <Section key={tab} {...props} />
      </Suspense>
    </section>
  );
}
