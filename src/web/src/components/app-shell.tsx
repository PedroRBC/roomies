import { useState } from "react";
import type { ReactNode } from "react";
import {
  Home,
  LogOut,
  Settings,
  Sun,
  Wallet,
  LayoutGrid,
  Users,
  Bell,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Choice } from "@/components/choice";
import { HouseWorkspace } from "@/components/house-workspace";
import { usePreferences } from "@/lib/preferences";
import type { House, User } from "@/lib/api";
import type { readRoute } from "@/lib/navigation";
import { houseLink } from "@/lib/navigation";

export function AppShell({
  user,
  houses,
  activeHouse,
  route,
  navigate,
  onSelect,
  onLogout,
  busy,
  children,
  settings,
  onUnauthorized,
  onChanged,
}: {
  user: User | null;
  houses: House[];
  activeHouse: string;
  route: ReturnType<typeof readRoute>;
  navigate: (path: string) => void;
  onSelect: (id: string) => void;
  onLogout: () => void;
  busy: boolean;
  children: ReactNode;
  settings?: ReactNode;
  onUnauthorized: () => void;
  onChanged: () => void;
}) {
  const { t } = usePreferences();
  const [panel, setPanel] = useState<
    "members" | "notifications" | "settings" | null
  >(null);
  const house = houses.find((h) => h.id === activeHouse);
  const space = route.houseId
    ? ["expenses", "balances"].includes(route.tab)
      ? "money"
      : "household"
    : "today";
  const authPage = !user && route.path !== "/settings";
  const destinations = [
    {
      id: "today",
      label: t("Today", "Hoje", "Hoy"),
      icon: Sun,
      path: "/dashboard",
    },
    {
      id: "money",
      label: t("Money", "Dinheiro", "Dinero"),
      icon: Wallet,
      path: houseLink(activeHouse, "expenses"),
    },
    {
      id: "household",
      label: t("Household", "Casa", "Casa"),
      icon: LayoutGrid,
      path: houseLink(activeHouse, "groceries"),
    },
  ];
  return (
    <div className="min-h-svh bg-background text-foreground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:z-[60] focus:bg-card focus:p-4"
      >
        {t("Skip to content", "Pular para o conteúdo", "Saltar al contenido")}
      </a>
      <header className="border-b bg-card">
        <div className="mx-auto flex min-h-18 max-w-[1320px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <Button
              variant="ghost"
              className="roomies-wordmark hidden px-0 text-2xl sm:inline-flex"
              onClick={() => navigate("/dashboard")}
            >
              Roomies
            </Button>
            {user ? (
              <div className="w-full min-w-0 max-w-64">
                {houses.length ? (
                  <Choice
                    hideLabel
                    label={t("Your house", "Sua casa", "Tu casa")}
                    value={activeHouse || houses[0].id}
                    choices={[
                      ...houses.map((h) => ({ value: h.id, label: h.name })),
                      {
                        value: "__create__",
                        label: t("Create house", "Criar casa", "Crear casa"),
                      },
                    ]}
                    onChange={(id) => {
                      setPanel(null);
                      if (id === "__create__") navigate("/dashboard?create=1");
                      else {
                        onSelect(id);
                        if (route.houseId) navigate(houseLink(id, route.tab));
                      }
                    }}
                  />
                ) : (
                  <Button
                    variant="ghost"
                    onClick={() => navigate("/dashboard?create=1")}
                  >
                    <Home />
                    {t("Create house", "Criar casa", "Crear casa")}
                  </Button>
                )}
              </div>
            ) : (
              <span className="roomies-wordmark text-2xl">Roomies</span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-0 sm:gap-1 [&>button]:size-10 sm:[&>button]:size-12">
            {user && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={!house}
                  aria-label={t(
                    "House members",
                    "Membros da casa",
                    "Miembros de la casa",
                  )}
                  onClick={() => setPanel("members")}
                >
                  <Users />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={!house}
                  aria-label={t(
                    "Notifications",
                    "Notificações",
                    "Notificaciones",
                  )}
                  onClick={() => setPanel("notifications")}
                >
                  <Bell />
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("Settings", "Configurações", "Ajustes")}
              onClick={() =>
                user
                  ? setPanel("settings")
                  : navigate(route.path === "/settings" ? "/" : "/settings")
              }
            >
              <Settings />
            </Button>
          </div>
        </div>
        {user && (
          <nav
            className="mx-auto flex max-w-[1320px] gap-1 px-4 sm:px-8"
            aria-label={t(
              "Workspaces",
              "Espaços de trabalho",
              "Espacios de trabajo",
            )}
          >
            {destinations.map(({ id, label, icon: Icon, path }) => (
              <button
                key={id}
                type="button"
                disabled={id !== "today" && !activeHouse}
                aria-current={space === id ? "page" : undefined}
                onClick={() => navigate(path)}
                className="flex min-h-12 flex-1 items-center justify-center gap-2 border-b-2 border-transparent px-4 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40 aria-[current=page]:border-primary aria-[current=page]:text-foreground sm:flex-none"
              >
                <Icon className="size-4" />
                {label}
              </button>
            ))}
          </nav>
        )}
      </header>
      <main
        id="main"
        className={
          authPage
            ? "flex min-h-[calc(100svh-144px)] flex-col"
            : "mx-auto w-full max-w-[1320px] px-4 py-7 sm:px-8 sm:py-10"
        }
      >
        {children}
      </main>
      {user && (
        <Dialog
          open={panel !== null}
          onOpenChange={(open) => {
            if (!open) setPanel(null);
          }}
        >
          <DialogContent
            aria-describedby={undefined}
            className="inset-y-0 right-0 left-auto h-svh w-full max-w-[640px] translate-x-0 translate-y-0 overflow-y-auto rounded-none p-6 sm:max-w-[640px]"
          >
            <DialogTitle>
              {panel === "members"
                ? t("House members", "Membros da casa", "Miembros de la casa")
                : panel === "notifications"
                  ? t(
                      "Notifications & reminders",
                      "Notificações e lembretes",
                      "Notificaciones y recordatorios",
                    )
                  : t("Your settings", "Suas configurações", "Tus ajustes")}
            </DialogTitle>
            {panel === "settings" ? (
              <>
                {settings}
                <Button variant="outline" disabled={busy} onClick={onLogout}>
                  <LogOut />
                  {t("Sign out", "Sair", "Cerrar sesión")}
                </Button>
              </>
            ) : (
              house &&
              panel && (
                <HouseWorkspace
                  key={`${house.id}:${panel}`}
                  house={house}
                  user={user}
                  tab={panel}
                  onUnauthorized={onUnauthorized}
                  onChanged={onChanged}
                />
              )
            )}
          </DialogContent>
        </Dialog>
      )}
      {authPage && (
        <footer className="flex h-14 items-center justify-center text-xs text-muted-foreground">
          {route.path !== "/register" &&
            t(
              "Private by default",
              "Privado por padrão",
              "Privado por defecto",
            )}
        </footer>
      )}
    </div>
  );
}
