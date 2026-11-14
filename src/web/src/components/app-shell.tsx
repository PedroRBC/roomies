import { useState } from "react";
import type { ReactNode } from "react";
import {
  Home,
  LogOut,
  Settings,
  LayoutDashboard,
  StickyNote,
  ShoppingBasket,
  Wallet,
  ListChecks,
  CalendarDays,
  Scale,
  Bell,
  Users,
  Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Choice } from "@/components/choice";
import { usePreferences } from "@/lib/preferences";
import type { House, User } from "@/lib/api";
import type { HouseTab, readRoute } from "@/lib/navigation";
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
}) {
  const { t } = usePreferences();
  const [menuOpen, setMenuOpen] = useState(false);
  const sections: { tab: HouseTab; label: string; icon: typeof Home }[] = [
    { tab: "notes", label: t("Notes", "Notas", "Notas"), icon: StickyNote },
    {
      tab: "groceries",
      label: t("Groceries", "Compras", "Compras"),
      icon: ShoppingBasket,
    },
    {
      tab: "expenses",
      label: t("Expenses", "Despesas", "Gastos"),
      icon: Wallet,
    },
    {
      tab: "chores",
      label: t("Chores", "Tarefas", "Tareas"),
      icon: ListChecks,
    },
    {
      tab: "calendar",
      label: t("Calendar", "Calendário", "Calendario"),
      icon: CalendarDays,
    },
    { tab: "balances", label: t("Balances", "Saldos", "Saldos"), icon: Scale },
    {
      tab: "notifications",
      label: t("Notifications", "Notificações", "Notificaciones"),
      icon: Bell,
    },
    { tab: "members", label: t("Members", "Membros", "Miembros"), icon: Users },
  ];
  function go(path: string) {
    setMenuOpen(false);
    navigate(path);
  }
  function navigation() {
    return (
      <div className="flex h-full min-h-0 flex-col px-3 pt-4 pb-3">
        <Button
          variant="ghost"
          className="roomies-wordmark mb-[18px] h-auto justify-start px-3 pt-1 pb-0 text-[26px] hover:bg-transparent"
          onClick={() => go("/dashboard")}
        >
          Roomies
        </Button>
        <Button
          variant="ghost"
          className="roomies-nav-item"
          aria-current={route.path === "/dashboard" ? "page" : undefined}
          onClick={() => go("/dashboard")}
        >
          <LayoutDashboard aria-hidden="true" />
          {t("Home", "Início", "Inicio")}
        </Button>
        <p
          className="px-3 pt-[18px] pb-1.5 text-[11px] font-bold tracking-[0.8px] text-muted-foreground uppercase"
          aria-hidden="true"
        >
          {t("House", "Casa", "Casa")}
        </p>
        <nav
          className="grid content-start gap-0.5 overflow-y-auto"
          aria-label={t(
            "House sections",
            "Seções da casa",
            "Secciones de la casa",
          )}
        >
          {sections.map(({ tab, label, icon: Icon }) => (
            <Button
              key={tab}
              variant="ghost"
              className="roomies-nav-item"
              disabled={!activeHouse}
              aria-current={
                route.houseId && route.tab === tab ? "page" : undefined
              }
              onClick={() => go(houseLink(activeHouse, tab))}
            >
              <Icon aria-hidden="true" />
              {label}
            </Button>
          ))}
        </nav>
        <div className="mt-auto pt-3">
          <div className="mb-2 border-t" />
          <Button
            variant="ghost"
            className="roomies-nav-item"
            aria-current={route.path === "/settings" ? "page" : undefined}
            onClick={() => go("/settings")}
          >
            <Settings aria-hidden="true" />
            {t("Settings", "Configurações", "Ajustes")}
          </Button>
          <Button
            variant="ghost"
            className="roomies-nav-item mt-0.5"
            disabled={busy}
            onClick={() => {
              setMenuOpen(false);
              onLogout();
            }}
          >
            <LogOut aria-hidden="true" />
            {t("Sign out", "Sair", "Cerrar sesión")}
          </Button>
        </div>
      </div>
    );
  }
  const authPage = !user && route.path !== "/settings";
  return (
    <div
      className={`min-h-svh bg-background text-foreground ${user ? "min-[900px]:pl-[248px]" : ""}`}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:z-[60] focus:bg-card focus:p-4"
      >
        {t("Skip to content", "Pular para o conteúdo", "Saltar al contenido")}
      </a>
      {user && (
        <>
          <aside
            className="fixed inset-y-0 left-0 hidden w-[248px] border-r bg-card min-[900px]:block"
            aria-label={t("Navigation", "Navegação", "Navegación")}
          >
            {navigation()}
          </aside>
          <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
            <DialogContent
              className="inset-y-0 left-0 h-svh w-[min(320px,calc(100vw-48px))] max-w-none translate-x-0 translate-y-0 rounded-none border-r bg-card p-0 min-[900px]:hidden"
              aria-describedby={undefined}
            >
              <DialogTitle className="sr-only">
                {t("Navigation", "Navegação", "Navegación")}
              </DialogTitle>
              {navigation()}
            </DialogContent>
          </Dialog>
        </>
      )}
      <header className="relative flex h-14 items-center justify-center px-3">
        {user ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-2 min-[900px]:hidden"
              aria-label={t("Open menu", "Abrir menu", "Abrir menú")}
              onClick={() => setMenuOpen(true)}
            >
              <Menu aria-hidden="true" />
            </Button>
            <div className="max-w-[calc(100%-104px)]">
              {houses.length ? (
                <Choice
                  hideLabel
                  label={t("Your house", "Sua casa", "Tu casa")}
                  value={
                    houses.some((h) => h.id === activeHouse)
                      ? activeHouse
                      : houses[0].id
                  }
                  choices={[
                    ...houses.map((h) => ({ value: h.id, label: h.name })),
                    {
                      value: "__create__",
                      label: t("Create house", "Criar casa", "Crear casa"),
                    },
                  ]}
                  onChange={(id) => {
                    if (id === "__create__") go("/dashboard?create=1");
                    else {
                      onSelect(id);
                      if (route.houseId) go(houseLink(id, route.tab));
                    }
                  }}
                />
              ) : (
                <Button
                  variant="ghost"
                  onClick={() => go("/dashboard?create=1")}
                >
                  <Home aria-hidden="true" />
                  {t("Create house", "Criar casa", "Crear casa")}
                </Button>
              )}
            </div>
          </>
        ) : (
          <>
            {route.path === "/settings" && (
              <Button
                variant="ghost"
                className="absolute left-2"
                onClick={() => go("/")}
              >
                {t("Back", "Voltar", "Volver")}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2"
              onClick={() => go("/settings")}
              aria-label={t("Settings", "Configurações", "Ajustes")}
              title={t("Settings", "Configurações", "Ajustes")}
            >
              <Settings
                className="size-6! text-muted-foreground"
                aria-hidden="true"
              />
            </Button>
          </>
        )}
      </header>
      <main
        id="main"
        className={
          authPage
            ? "flex min-h-[calc(100svh-112px)] flex-col"
            : route.houseId
              ? "mx-auto w-full max-w-[860px] px-5 pt-2 pb-8"
              : "mx-auto w-full max-w-[1200px] px-5 py-4"
        }
      >
        {children}
      </main>
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
