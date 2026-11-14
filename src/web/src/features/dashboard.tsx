import { useEffect, useRef, useState } from "react";
import type { SubmitEvent } from "react";
import type { Expense, House, Note, User } from "@/lib/api";
import { api, ApiError } from "@/lib/api";
import { housePath } from "@/lib/features";
import { houseLink } from "@/lib/navigation";
import { usePreferences } from "@/lib/preferences";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlarmClock, CalendarDays, ListChecks } from "lucide-react";
import { Field } from "@/components/field";
interface Summary {
  expenses: Expense[];
  notes: Note[];
  events: {
    title: string;
    when: string;
    kind: "calendar" | "schedule" | "chore";
  }[];
}
interface CalendarEntry {
  title: string;
  start_local: string;
}
interface ScheduleEntry {
  title: string;
  enabled: boolean;
  next_occurrence_at?: string;
  dtstart_local: string;
}
interface ChoreEntry {
  title: string;
  enabled: boolean;
  due_local: string;
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
    <section className="mx-auto w-full max-w-[720px]">
      <div className="roomies-page-heading mb-4">
        <h1 className="roomies-page-title">
          {t(`Hi, ${user.name}`, `Olá, ${user.name}`, `Hola, ${user.name}`)}
        </h1>
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
          key={house.id}
          house={house}
          navigate={navigate}
          onUnauthorized={onUnauthorized}
        />
      )}
    </section>
  );
}
function SummaryView({
  house,
  navigate,
  onUnauthorized,
}: {
  house: House;
  navigate: (path: string) => void;
  onUnauthorized: () => void;
}) {
  const { t, money, locale } = usePreferences();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const swipe = useRef<number | null>(null);
  const [month] = useState(() =>
    new Date().toLocaleDateString("en-CA").slice(0, 7),
  );
  const base = housePath(house.id);
  useEffect(() => {
    let active = true;
    Promise.all([
      api<Expense[]>(`${base}/expenses`),
      api<Note[]>(`${base}/notes`),
      api<CalendarEntry[]>(`${base}/calendar`),
      api<ScheduleEntry[]>(`${base}/scheduled-events`),
      api<ChoreEntry[]>(`${base}/chores`),
    ])
      .then(([expenses, notes, calendar, scheduled, chores]) => {
        if (active)
          setSummary({
            expenses: expenses.filter((expense) =>
              expense.date.startsWith(month),
            ),
            notes: notes.slice(0, 8),
            events: [
              ...calendar.map((item) => ({
                title: item.title,
                when: item.start_local,
                kind: "calendar" as const,
              })),
              ...scheduled
                .filter((item) => item.enabled)
                .map((item) => ({
                  title: item.title,
                  when: item.next_occurrence_at ?? item.dtstart_local,
                  kind: "schedule" as const,
                })),
              ...chores
                .filter((item) => item.enabled)
                .map((item) => ({
                  title: item.title,
                  when: item.due_local,
                  kind: "chore" as const,
                })),
            ]
              .sort((a, b) => a.when.localeCompare(b.when))
              .slice(0, 6),
          });
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
  }, [base, month, revision, onUnauthorized]);
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
          {error}
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
  const cents = summary.expenses.reduce(
    (sum, item) => sum + Math.round(item.amount * 100),
    0,
  );
  const [year, monthNumber] = month.split("-").map(Number);
  const daily = Array<number>(new Date(year, monthNumber, 0).getDate()).fill(0);
  for (const expense of summary.expenses) {
    const day = Number(expense.date.slice(8, 10));
    if (Number.isInteger(day) && day >= 1 && day <= daily.length)
      daily[day - 1] += Math.round(expense.amount * 100);
  }
  const max = Math.max(...daily, 1);
  const dayLabels = daily.map(
    (amount, i) => `${t("Day", "Dia", "Día")} ${i + 1}: ${money(amount / 100)}`,
  );
  const note = summary.notes[index % summary.notes.length];
  return (
    <div className="grid gap-8 py-2">
      <Card className="gap-2">
        <CardHeader>
          <CardTitle className="font-sans text-base font-semibold">
            {t("This month", "Gastos do mês", "Este mes")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {summary.expenses.length === 0 ? (
            <p className="text-base text-muted-foreground">
              {t(
                "No expenses this month.",
                "Nenhuma despesa neste mês.",
                "No hay gastos este mes.",
              )}
            </p>
          ) : (
            <>
              <p className="mb-4 font-heading text-[22px] leading-[1.2] font-semibold text-[var(--accent-deep)] tabular-nums">
                {t("Total:", "Total:", "Total:")} {money(cents / 100)}
              </p>
              <div
                className="flex h-24 items-end"
                role="img"
                aria-label={t(
                  "Spending by day",
                  "Gastos por dia",
                  "Gastos por día",
                )}
                aria-description={dayLabels.join("; ")}
              >
                {daily.map((amount, i) => (
                  <div
                    key={i}
                    title={dayLabels[i]}
                    className="flex h-full min-w-0 flex-1 items-end justify-center"
                  >
                    <div
                      className={`w-3/5 max-w-3.5 rounded-full ${amount > 0 ? "bg-primary" : "aspect-square bg-muted"}`}
                      style={{
                        height:
                          amount > 0
                            ? `max(8px, ${(amount / max) * 100}%)`
                            : undefined,
                      }}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
          {summary.expenses.length > 0 && (
            <ul
              aria-label={t(
                "Recent expenses",
                "Despesas recentes",
                "Gastos recientes",
              )}
              className="mt-2.5"
            >
              {summary.expenses.slice(0, 3).map((expense) => (
                <li
                  key={expense.id}
                  className="flex justify-between gap-3 py-1"
                >
                  <span className="min-w-0 truncate text-sm font-semibold">
                    {expense.description}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {money(expense.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card className="gap-2">
        <CardHeader>
          <CardTitle className="font-sans text-base font-semibold">
            {t("Upcoming", "Próximos", "Próximos")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {summary.events.length === 0 ? (
            <p className="text-base text-muted-foreground">
              {t(
                "Nothing coming up.",
                "Nada agendado por agora.",
                "Nada programado por ahora.",
              )}
            </p>
          ) : (
            <ul>
              {summary.events.map((event, i) => (
                <li key={i} className="flex items-start gap-3 py-2">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                    {event.kind === "calendar" ? (
                      <CalendarDays className="size-5" aria-hidden="true" />
                    ) : event.kind === "chore" ? (
                      <ListChecks className="size-5" aria-hidden="true" />
                    ) : (
                      <AlarmClock className="size-5" aria-hidden="true" />
                    )}
                    <span className="sr-only">
                      {event.kind === "calendar"
                        ? t("Calendar", "Calendário", "Calendario")
                        : event.kind === "chore"
                          ? t("Chore", "Tarefa", "Tarea")
                          : t("Reminder", "Lembrete", "Recordatorio")}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{event.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {Number.isNaN(Date.parse(event.when))
                        ? event.when
                        : new Date(event.when).toLocaleString(locale)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
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
          <Button
            variant="ghost"
            onClick={() => navigate(houseLink(house.id, "notes"))}
          >
            {t("Open notes", "Ver notas", "Ver notas")}
          </Button>
        </CardHeader>
        <CardContent>
          {!note ? (
            <p className="text-base text-muted-foreground">
              {t("No notes yet.", "Nenhuma nota ainda.", "Aún no hay notas.")}
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
    </div>
  );
}
