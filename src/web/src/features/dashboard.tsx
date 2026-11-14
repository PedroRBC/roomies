import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { SubmitEvent } from "react";
import type { House, Member, Note, User } from "@/lib/api";
import { api, ApiError } from "@/lib/api";
import { housePath } from "@/lib/features";
import { usePreferences } from "@/lib/preferences";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DashboardAgenda, type Agenda } from "./dashboard-agenda";
import { DashboardAutomations } from "./dashboard-automations";
import type { ScheduledEvent } from "./notifications-model";
import { HouseWorkspace } from "@/components/house-workspace";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
const Groceries = lazy(() =>
  import("./household").then((m) => ({ default: m.Groceries })),
);
import type { HouseTab } from "@/lib/navigation";
import { Plus, StickyNote, CalendarPlus, ListChecks } from "lucide-react";
import { Field } from "@/components/field";
interface Summary {
  notes: Note[];
  scheduled: ScheduledEvent[];
  members?: Member[];
  partial: boolean;
  notesUnavailable: boolean;
  remindersUnavailable: boolean;
  agenda?: Agenda;
  loadedAt: number;
}
export function Dashboard({
  user,
  houses,
  selected,
  onCreate,
  navigate,
  onUnauthorized,
  createRequested = false,
}: {
  user: User;
  houses: House[];
  selected: string;
  onSelect: (id: string) => void;
  onCreate: (name: string) => Promise<void>;
  navigate: (path: string) => void;
  onUnauthorized: () => void;
  createRequested?: boolean;
}) {
  const { t } = usePreferences();
  const [showCreate, setShowCreate] = useState(createRequested);
  const [previousCreateRequested, setPreviousCreateRequested] =
    useState(createRequested);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const house = houses.find((item) => item.id === selected) ?? houses[0];
  if (createRequested !== previousCreateRequested) {
    setPreviousCreateRequested(createRequested);
    setShowCreate(createRequested);
  }
  async function create(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name")).trim();
    if (!name) return;
    setBusy(true);
    setError("");
    try {
      await onCreate(name);
      form.reset();
      setShowCreate(false);
      if (createRequested) navigate("/dashboard");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mx-auto w-full max-w-[1040px]">
      <div className="roomies-page-heading mb-4">
        <h1 className="roomies-page-title">{t("Today", "Hoje", "Hoy")}</h1>
      </div>
      {!houses.length && (
        <p className="mb-4 text-base text-muted-foreground">
          {t(
            "Create your first house to get started.",
            "Crie a primeira casa para começar.",
            "Crea tu primera casa para empezar.",
          )}
        </p>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {(!houses.length || showCreate) && (
        <Card>
          <CardHeader>
            <CardTitle className="font-sans text-base font-semibold">
              {t("New house", "Nova casa", "Nueva casa")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={create} className="grid gap-4">
              <Field
                label={t("House name", "Nome da casa", "Nombre de la casa")}
                name="name"
                required
                maxLength={100}
              />
              <div className="flex justify-end gap-3">
                {houses.length > 0 && (
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      setShowCreate(false);
                      if (createRequested) navigate("/dashboard");
                    }}
                  >
                    {t("Cancel", "Cancelar", "Cancelar")}
                  </Button>
                )}
                <Button type="submit" disabled={busy}>
                  {t("Create house", "Criar casa", "Crear casa")}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
      {house && !showCreate && (
        <SummaryView
          key={`${house.id}:${user.id}`}
          house={house}
          user={user}
          navigate={navigate}
          onUnauthorized={onUnauthorized}
        />
      )}
    </section>
  );
}
function SummaryView({
  house,
  user,
  navigate,
  onUnauthorized,
}: {
  house: House;
  user: User;
  navigate: (path: string) => void;
  onUnauthorized: () => void;
}) {
  const { t } = usePreferences();
  const userId = user.id;
  const [task, setTask] = useState<HouseTab | null>(null);
  const [createTask, setCreateTask] = useState(false);
  const openTask = (tab: HouseTab, create = false) => {
    setCreateTask(create);
    setTask(tab);
  };
  const [summary, setSummary] = useState<Summary | null>(null);
  const previousSummary = useRef<Summary | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const swipe = useRef<number | null>(null);
  const shopping = useRef<HTMLDivElement>(null);
  const base = housePath(house.id);
  useEffect(() => {
    let active = true;
    Promise.allSettled([
      api<Note[]>(`${base}/notes`),
      api<ScheduledEvent[]>(`${base}/scheduled-events`),
      api<Member[]>(`${base}/members`),
      api<Agenda>(`${base}/agenda`),
    ]).then(([notes, scheduled, members, agenda]) => {
      if (!active) return;
      const results = [notes, scheduled, members, agenda];
      if (
        results.some(
          (r) =>
            r.status === "rejected" &&
            r.reason instanceof ApiError &&
            r.reason.status === 401,
        )
      ) {
        previousSummary.current = null;
        setSummary(null);
        onUnauthorized();
        return;
      }
      if (
        results.some(
          (r) =>
            r.status === "rejected" &&
            r.reason instanceof ApiError &&
            r.reason.status === 403,
        )
      ) {
        previousSummary.current = null;
        setSummary(null);
        setError("load");
        return;
      }
      const previous = previousSummary.current;
      setError("");
      const next: Summary = {
        notes:
          notes.status === "fulfilled"
            ? notes.value.slice(0, 8)
            : (previous?.notes ?? []),
        scheduled:
          scheduled.status === "fulfilled"
            ? scheduled.value
            : (previous?.scheduled ?? []),
        notesUnavailable:
          notes.status === "rejected" &&
          (!previous || previous.notesUnavailable),
        remindersUnavailable:
          scheduled.status === "rejected" &&
          (!previous || previous.remindersUnavailable),
        members:
          members.status === "fulfilled" ? members.value : previous?.members,
        agenda:
          agenda.status === "fulfilled" && Array.isArray(agenda.value.entries)
            ? agenda.value
            : previous?.agenda,
        partial: results.some((r) => r.status === "rejected"),
        loadedAt: Date.now(),
      };
      previousSummary.current = next;
      setSummary(next);
    });
    return () => {
      active = false;
    };
  }, [base, revision, onUnauthorized]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") setRevision((v) => v + 1);
    };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  useEffect(() => {
    if (
      !summary ||
      summary.notes.length < 2 ||
      paused ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const timer = window.setInterval(
      () => setIndex((value) => (value + 1) % summary.notes.length),
      7000,
    );
    return () => window.clearInterval(timer);
  }, [summary, paused]);
  if (error)
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {t(
            "Unable to load the dashboard. Try again.",
            "Não foi possível carregar o painel. Tente novamente.",
            "No se pudo cargar el panel. Reintenta.",
          )}
          <Button
            variant="outline"
            className="ml-3"
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
  if (!summary)
    return (
      <p role="status">
        {t(
          "Loading household summary…",
          "Carregando resumo da casa…",
          "Cargando resumen de la casa…",
        )}
      </p>
    );
  const note = summary.notes[index % summary.notes.length];
  const writable =
    summary.members?.some(
      (m) =>
        m.user_id === userId && (m.role === "admin" || m.role === "member"),
    ) ?? false;
  return (
    <div className="grid gap-8 py-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{house.name}</p>
        <Button variant="outline" onClick={() => setRevision((v) => v + 1)}>
          {t("Refresh dashboard", "Atualizar painel", "Actualizar panel")}
        </Button>
      </div>
      {summary.partial && (
        <p role="status" className="text-sm text-muted-foreground">
          {t(
            "Some data could not be refreshed. Last loaded values are kept where available. Refresh to retry.",
            "Alguns dados não foram atualizados. Os últimos valores carregados foram mantidos quando disponíveis. Atualize para tentar novamente.",
            "Algunos datos no se actualizaron. Se conservan los últimos valores disponibles. Actualiza para reintentar.",
          )}
        </p>
      )}
      <div className="flex flex-wrap gap-2 border-b pb-5">
        <Button
          disabled={!writable}
          onClick={() =>
            shopping.current
              ?.querySelector<HTMLInputElement>('input[name="name"]')
              ?.focus()
          }
        >
          <Plus className="size-4" />
          {t("Add shopping item", "Adicionar compra", "Añadir compra")}
        </Button>
        <Button
          disabled={!writable}
          variant="outline"
          onClick={() => openTask("expenses", true)}
        >
          <Plus className="size-4" />
          {t("Add expense", "Adicionar despesa", "Añadir gasto")}
        </Button>
        <Button
          disabled={!writable}
          variant="outline"
          onClick={() => openTask("notes", true)}
        >
          <StickyNote className="size-4" />
          {t("Write a note", "Escrever nota", "Escribir nota")}
        </Button>
        <Button
          disabled={!writable}
          variant="ghost"
          onClick={() => openTask("chores", true)}
        >
          <ListChecks className="size-4" />
          {t("Chores", "Tarefas", "Tareas")}
        </Button>
        <Button
          disabled={!writable}
          variant="ghost"
          onClick={() => openTask("calendar", true)}
        >
          <CalendarPlus className="size-4" />
          {t("Plan an event", "Planejar evento", "Planear evento")}
        </Button>
      </div>
      <div className="grid items-start gap-8 lg:grid-cols-[1.15fr_1fr]">
        <div className="grid gap-6">
          <DashboardAgenda
            onOpen={(tab) => openTask(tab)}
            now={summary.loadedAt}
            agenda={summary.agenda}
            reminders={summary.scheduled}
            houseId={house.id}
            navigate={navigate}
          />
        </div>
        <div
          ref={shopping}
          className="border-t pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8"
        >
          <Suspense
            fallback={
              <p role="status">
                {t(
                  "Loading shopping list…",
                  "Carregando lista de compras…",
                  "Cargando lista de compras…",
                )}
              </p>
            }
          >
            {summary.members ? (
              <Groceries
                houseId={house.id}
                user={user}
                members={summary.members}
                role={
                  summary.members.find((m) => m.user_id === userId)?.role ??
                  null
                }
                onUnauthorized={onUnauthorized}
              />
            ) : (
              <p>
                {t(
                  "Shopping list unavailable. Refresh to retry.",
                  "Lista indisponível. Atualize para tentar novamente.",
                  "Lista no disponible. Actualiza para reintentar.",
                )}
              </p>
            )}
          </Suspense>
        </div>
      </div>
      <details className="border-y py-4">
        <summary className="cursor-pointer font-semibold">
          {t(
            "Reminders & automations",
            "Lembretes e automações",
            "Recordatorios y automatizaciones",
          )}
        </summary>
        <div className="pt-4">
          {summary.remindersUnavailable ? (
            <p role="status">
              {t(
                "Reminders unavailable. Refresh to retry.",
                "Lembretes indisponíveis. Atualize para tentar novamente.",
                "Recordatorios no disponibles. Actualiza para reintentar.",
              )}
            </p>
          ) : (
            <DashboardAutomations
              houseId={house.id}
              writable={
                summary.members?.some(
                  (m) =>
                    m.user_id === userId &&
                    (m.role === "admin" || m.role === "member"),
                ) ?? false
              }
              events={summary.scheduled}
              refresh={() => setRevision((v) => v + 1)}
              navigate={navigate}
              onUnauthorized={onUnauthorized}
            />
          )}
        </div>
      </details>
      <Card
        className="gap-2"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            setPaused(false);
        }}
      >
        <CardHeader className="flex! flex-row items-center justify-between">
          <CardTitle className="font-sans text-base font-semibold">
            {t("House notes", "Notas da casa", "Notas de la casa")}
          </CardTitle>
          <Button variant="ghost" onClick={() => openTask("notes")}>
            {t("Open notes", "Ver notas", "Ver notas")}
          </Button>
        </CardHeader>
        <CardContent>
          {!note ? (
            <p className="text-base text-muted-foreground">
              {summary.notesUnavailable
                ? t(
                    "Notes unavailable. Refresh to retry.",
                    "Notas indisponíveis. Atualize para tentar novamente.",
                    "Notas no disponibles. Actualiza para reintentar.",
                  )
                : t(
                    "No notes yet.",
                    "Nenhuma nota ainda.",
                    "Aún no hay notas.",
                  )}
            </p>
          ) : (
            <div
              onPointerDown={(event) => {
                swipe.current = event.clientX;
              }}
              onPointerUp={(event) => {
                const start = swipe.current;
                if (start !== null && Math.abs(event.clientX - start) > 40)
                  setIndex(
                    (value) =>
                      (value +
                        (event.clientX < start
                          ? 1
                          : summary.notes.length - 1)) %
                      summary.notes.length,
                  );
                swipe.current = null;
              }}
            >
              <div className="rounded-[14px] border bg-background p-4">
                <h3 className="text-[19px] font-bold tracking-[-0.1px]">
                  {note.title}
                </h3>
                <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-base leading-[1.45]">
                  {note.content}
                </p>
              </div>
              {summary.notes.length > 1 && (
                <div
                  className="mt-3 flex items-center justify-center gap-1.5"
                  aria-label={t(
                    "House notes",
                    "Notas da casa",
                    "Notas de la casa",
                  )}
                >
                  {summary.notes.map((item, i) => (
                    <button
                      key={item.id}
                      type="button"
                      aria-label={`${t("Open note", "Abrir nota", "Abrir nota")} ${i + 1}: ${item.title}`}
                      aria-pressed={i === index % summary.notes.length}
                      onClick={() => setIndex(i)}
                      className="flex size-6 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <span
                        className={`h-1.5 rounded-full ${i === index % summary.notes.length ? "w-4 bg-primary" : "w-1.5 bg-border"}`}
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog
        open={task !== null}
        onOpenChange={(open) => {
          if (!open) {
            setTask(null);
            setRevision((v) => v + 1);
          }
        }}
      >
        <DialogContent
          aria-describedby={undefined}
          className="inset-y-0 right-0 left-auto h-svh w-full max-w-[680px] translate-x-0 translate-y-0 overflow-y-auto rounded-none p-6 sm:max-w-[680px]"
        >
          <DialogTitle>
            {t("Quick workspace", "Espaço rápido", "Espacio rápido")}
          </DialogTitle>
          <Suspense
            fallback={
              <p role="status">{t("Loading…", "Carregando…", "Cargando…")}</p>
            }
          >
            {task && (
              <HouseWorkspace
                key={`${house.id}:${task}`}
                house={house}
                user={user}
                tab={task}
                quick
                createRequested={createTask}
                onUnauthorized={onUnauthorized}
                onChanged={() => setRevision((v) => v + 1)}
              />
            )}
          </Suspense>
        </DialogContent>
      </Dialog>
    </div>
  );
}
