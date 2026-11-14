import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Auth } from "@/components/auth";
import { Security } from "@/components/security";
import { AppShell } from "@/components/app-shell";
import { HouseWorkspace } from "@/components/house-workspace";
import { Dashboard } from "@/features/dashboard";
import { Settings } from "@/features/settings";
import { AcceptInvitation } from "@/features/invitation";
import {
  captureInvitation,
  hasPendingInvitation,
} from "@/features/invitation-state";
import { PreferencesProvider, usePreferences } from "@/lib/preferences";
import { houseLink, readRoute, useRoute } from "@/lib/navigation";
import { api, ApiError } from "@/lib/api";
import type { House, User } from "@/lib/api";
async function bootstrap() {
  captureInvitation();
  let user: User | null = null;
  try {
    user = await api<User>("/auth/me");
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401) throw err;
  }
  return { user };
}
export default function App() {
  return (
    <PreferencesProvider>
      <AppContent />
    </PreferencesProvider>
  );
}
function AppContent() {
  const { t, preferences, setPreference } = usePreferences();
  const route = useRoute();
  const { navigate } = route;
  const [user, setUser] = useState<User | null>(null);
  const [houses, setHouses] = useState<House[]>([]);
  const [focus, setFocus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [houseLoading, setHouseLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const startup = useRef<ReturnType<typeof bootstrap> | null>(null);
  const freshLogin = useRef(false);
  const defaultHouse = useRef(preferences.defaultHouse);
  useEffect(() => {
    defaultHouse.current = preferences.defaultHouse;
  }, [preferences.defaultHouse]);
  const onUnauthorized = useCallback(() => {
    setUser(null);
    setHouses([]);
    setFocus("");
    navigate("/", true);
  }, [navigate]);
  const refreshHouses = useCallback(
    () => setRevision((value) => value + 1),
    [],
  );
  useEffect(() => {
    let active = true;
    startup.current ??= bootstrap();
    startup.current
      .then((result) => {
        if (active) {
          setUser(result.user);
          setHouseLoading(!!result.user);
        }
      })
      .catch((err: Error) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [navigate]);
  useEffect(() => {
    if (!user) return;
    let active = true;
    api<House[]>("/houses")
      .then((result) => {
        if (!active) return;
        setHouses(result);
        const preferred =
          result.find((house) => house.id === defaultHouse.current)?.id ??
          result[0]?.id ??
          "";
        setFocus((value) =>
          result.some((house) => house.id === value) ? value : preferred,
        );
        const current = readRoute();
        if (hasPendingInvitation()) navigate("/accept-invitation", true);
        else if (["/", "/register", "/callback"].includes(current.path))
          navigate(
            !freshLogin.current &&
              result.some((house) => house.id === defaultHouse.current)
              ? houseLink(defaultHouse.current)
              : "/dashboard",
            true,
          );
        freshLogin.current = false;
      })
      .catch((err: ApiError) => {
        if (active) {
          setError(err.message);
          if (err.status === 401) onUnauthorized();
        }
      })
      .finally(() => {
        if (active) setHouseLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user, revision, navigate, onUnauthorized]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
      if ((err as ApiError).status === 401) onUnauthorized();
    } finally {
      setBusy(false);
    }
  }
  async function createHouse(name: string) {
    try {
      const house = await api<House>("/houses", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setHouses((current) => [...current, house]);
      setFocus(house.id);
      setPreference("defaultHouse", house.id);
    } catch (err) {
      if ((err as ApiError).status === 401) onUnauthorized();
      throw err;
    }
  }
  function login(user: User) {
    freshLogin.current = true;
    setHouseLoading(true);
    setUser(user);
  }
  const activeHouse = route.houseId || focus || houses[0]?.id || "";
  let content;
  if (loading)
    content = (
      <p role="status">
        {t("Opening Roomies…", "Abrindo Roomies…", "Abriendo Roomies…")}
      </p>
    );
  else if (route.path === "/settings")
    content = (
      <div className="mx-auto w-full max-w-[520px]">
        {user && <Security user={user} onChange={setUser} />}
        <Settings
          user={user}
          houses={houses}
          onRefresh={refreshHouses}
          onUnauthorized={onUnauthorized}
        />
      </div>
    );
  else if (!user)
    content = (
      <Auth
        onLogin={login}
        register={route.path === "/register"}
        navigate={navigate}
      />
    );
  else if (houseLoading)
    content = (
      <p role="status">
        {t(
          "Loading your houses…",
          "Carregando suas casas…",
          "Cargando tus casas…",
        )}
      </p>
    );
  else if (route.path === "/accept-invitation")
    content = (
      <AcceptInvitation
        onJoined={(houseId) => {
          refreshHouses();
          setFocus(houseId);
          navigate(houseLink(houseId), true);
        }}
        onUnauthorized={onUnauthorized}
      />
    );
  else if (route.houseId)
    content = (
      <HouseWorkspace
        key={route.houseId}
        house={
          houses.find((house) => house.id === route.houseId) ?? {
            id: route.houseId,
            name: "",
          }
        }
        user={user}
        tab={route.tab}
        onUnauthorized={onUnauthorized}
        onChanged={refreshHouses}
      />
    );
  else if (["/dashboard", "/", "/callback", "/register"].includes(route.path))
    content = (
      <Dashboard
        user={user}
        houses={houses}
        createRequested={route.create}
        selected={focus}
        onSelect={setFocus}
        onCreate={createHouse}
        navigate={navigate}
        onUnauthorized={onUnauthorized}
      />
    );
  else
    content = (
      <div className="grid gap-4">
        <h1 className="text-3xl">
          {t("Page not found", "Página não encontrada", "Página no encontrada")}
        </h1>
        <Button onClick={() => navigate("/dashboard")}>
          {t("Go to dashboard", "Ir ao painel", "Ir al panel")}
        </Button>
      </div>
    );
  return (
    <AppShell
      user={user}
      houses={houses}
      activeHouse={activeHouse}
      route={route}
      navigate={navigate}
      onSelect={setFocus}
      busy={busy}
      onLogout={() =>
        void run(async () => {
          await api("/auth/logout", { method: "POST" });
          onUnauthorized();
        })
      }
    >
      {error && (
        <Alert
          variant="destructive"
          className="mx-auto mb-4 w-full max-w-[920px]"
        >
          <AlertDescription>
            {error}
            <Button
              variant="outline"
              size="sm"
              className="ml-3"
              onClick={() => window.location.reload()}
            >
              {t("Reload", "Recarregar", "Recargar")}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {content}
    </AppShell>
  );
}
