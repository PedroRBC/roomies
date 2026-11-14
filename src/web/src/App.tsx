import { useCallback, useEffect, useRef, useState } from "react";
import {
  Home,
  LogOut,
  Settings as SettingsIcon,
  LayoutDashboard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Auth } from "@/components/auth";
import type { AuthConfig } from "@/components/auth";
import { Choice } from "@/components/choice";
import { HouseWorkspace } from "@/components/house-workspace";
import { Dashboard } from "@/features/dashboard";
import { Settings } from "@/features/settings";
import { AcceptInvitation } from "@/features/invitation";
import {
  captureInvitation,
  hasPendingInvitation,
} from "@/features/invitation-state";
import { PreferencesProvider, usePreferences } from "@/lib/preferences";
import { houseLink, houseTabs, readRoute, useRoute } from "@/lib/navigation";
import type { HouseTab } from "@/lib/navigation";
import { api, ApiError, workosUrl } from "@/lib/api";
import type { House, User } from "@/lib/api";
async function bootstrap() {
  captureInvitation();
  const params = new URLSearchParams(window.location.search);
  const callback = window.location.pathname === "/callback";
  const code = params.get("code"),
    state = params.get("state"),
    error = params.get("error_description") ?? params.get("error");
  if (callback) window.history.replaceState(null, "", "/");
  const config = await api<AuthConfig>("/auth/config");
  if (callback) {
    if (error) throw new Error(error);
    if (!code || !state)
      throw new Error("Sign-in was not completed. Please try again.");
    await api("/auth/workos/callback", {
      method: "POST",
      body: JSON.stringify({ code, state }),
    });
  }
  let user: User | null = null;
  try {
    user = await api<User>("/auth/me");
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401) throw err;
  }
  return { config, user, callback };
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
  const [config, setConfig] = useState<AuthConfig | null>(null);
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
          setConfig(result.config);
          setUser(result.user);
          freshLogin.current = result.callback;
          setHouseLoading(!!result.user);
          if (result.callback) navigate("/", true);
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
  const tabLabels: Record<HouseTab, string> = {
    expenses: t("Expenses", "Despesas", "Gastos"),
    notes: t("Notes", "Notas", "Notas"),
    groceries: t("Groceries", "Compras", "Compras"),
    chores: t("Chores", "Tarefas", "Tareas"),
    calendar: t("Calendar", "Calendário", "Calendario"),
    balances: t("Balances", "Saldos", "Saldos"),
    notifications: t("Notifications", "Notificações", "Notificaciones"),
    members: t("Members", "Membros", "Miembros"),
  };
  let content;
  if (loading)
    content = (
      <p role="status">
        {t("Opening Roomies…", "Abrindo Roomies…", "Abriendo Roomies…")}
      </p>
    );
  else if (route.path === "/settings")
    content = (
      <Settings
        user={user}
        houses={houses}
        onRefresh={refreshHouses}
        onUnauthorized={onUnauthorized}
      />
    );
  else if (!user)
    content = config && (
      <Auth
        config={config}
        onLogin={login}
        run={run}
        busy={busy}
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
    <div className="min-h-svh bg-background text-foreground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-background focus:p-4"
      >
        {t("Skip to content", "Pular para o conteúdo", "Saltar al contenido")}
      </a>
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Button
            variant="ghost"
            className="px-0 text-xl font-bold"
            onClick={() => navigate(user ? "/dashboard" : "/")}
          >
            <Home className="text-primary" aria-hidden="true" />
            Roomies
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            {user && (
              <span className="text-sm text-muted-foreground">{user.name}</span>
            )}
            <Button
              variant="ghost"
              onClick={() => navigate("/settings")}
              aria-label={t("Settings", "Configurações", "Ajustes")}
            >
              <SettingsIcon aria-hidden="true" />
              {t("Settings", "Configurações", "Ajustes")}
            </Button>
            {user && (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    let result: { logout_url?: string } | undefined;
                    try {
                      result = await api<{ logout_url?: string }>(
                        "/auth/logout",
                        { method: "POST" },
                      );
                    } finally {
                      onUnauthorized();
                    }
                    if (result?.logout_url)
                      window.location.assign(
                        workosUrl(result.logout_url, "logout"),
                      );
                  })
                }
              >
                <LogOut aria-hidden="true" />
                {t("Sign out", "Sair", "Cerrar sesión")}
              </Button>
            )}
          </div>
        </div>
      </header>
      <div
        className={`mx-auto max-w-7xl ${user ? "grid items-start gap-6 md:grid-cols-[210px_1fr]" : ""}`}
      >
        {user && (
          <aside
            className="grid gap-5 border-b p-5 md:sticky md:top-0 md:min-h-[calc(100svh-73px)] md:border-r md:border-b-0"
            aria-label={t("Navigation", "Navegação", "Navegación")}
          >
            <Button
              variant={route.path === "/dashboard" ? "secondary" : "ghost"}
              className="justify-start"
              onClick={() => navigate("/dashboard")}
            >
              <LayoutDashboard aria-hidden="true" />
              {t("Dashboard", "Painel", "Panel")}
            </Button>
            {houses.length > 0 && (
              <Choice
                label={t("Your house", "Sua casa", "Tu casa")}
                value={
                  houses.some((house) => house.id === activeHouse)
                    ? activeHouse
                    : houses[0].id
                }
                choices={[
                  ...houses.map((house) => ({ value: house.id, label: house.name })),
                  { value: "__create__", label: t("Create house", "Criar casa", "Crear casa") },
                ]}
                onChange={(id) => {
                  if (id === "__create__") {
                    navigate("/dashboard?create=1");
                    return;
                  }
                  setFocus(id);
                  if (route.houseId) navigate(houseLink(id, route.tab));
                }}
              />
            )}
            {activeHouse && (
              <nav
                aria-label={t(
                  "House sections",
                  "Seções da casa",
                  "Secciones de la casa",
                )}
                className="flex flex-wrap gap-1 md:grid"
              >
                {houseTabs.map((tab) => (
                  <Button
                    key={tab}
                    variant={
                      route.houseId && route.tab === tab ? "secondary" : "ghost"
                    }
                    className="justify-start"
                    onClick={() => navigate(houseLink(activeHouse, tab))}
                    aria-current={
                      route.houseId && route.tab === tab ? "page" : undefined
                    }
                  >
                    {tabLabels[tab]}
                  </Button>
                ))}
              </nav>
            )}
          </aside>
        )}
        <main id="main" className="min-w-0 px-5 py-6 sm:px-8 sm:py-9">
          {error && (
            <Alert variant="destructive" className="mb-6">
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
        </main>
      </div>
    </div>
  );
}
