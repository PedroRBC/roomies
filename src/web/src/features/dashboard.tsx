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
import { Badge } from "@/components/ui/badge";
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
  onSelect,
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
  const { t, preferences, setPreference } = usePreferences();
  const [showCreate, setShowCreate] = useState(createRequested);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const house = houses.find((item) => item.id === selected) ?? houses[0];
  useEffect(() => {
    setShowCreate(createRequested);
  }, [createRequested]);
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
    <section className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">
          {t(`Hi, ${user.name}`, `Olá, ${user.name}`, `Hola, ${user.name}`)}
        </h1>
        <Button onClick={() => setShowCreate(true)}>
          {t("New house", "Nova casa", "Nueva casa")}
        </Button>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {(!houses.length || showCreate) && (
        <Card>
          <CardHeader>
            <CardTitle>
              {t("Start your household", "Comece sua casa", "Crea tu hogar")}
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
              <div className="flex gap-3">
                <Button type="submit" disabled={busy}>
                  {t("Create house", "Criar casa", "Crear casa")}
                </Button>
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
              </div>
            </form>
          </CardContent>
        </Card>
      )}
      {houses.length > 0 && (
        <ul
          aria-label={t("Your houses", "Suas casas", "Tus casas")}
          className="flex flex-wrap gap-3"
        >
          {houses.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3"
            >
              <Button
                variant={item.id === house?.id ? "secondary" : "ghost"}
                onClick={() => onSelect(item.id)}
              >
                {item.name}
              </Button>
              {preferences.defaultHouse === item.id ? (
                <Badge>{t("Default", "Padrão", "Predeterminada")}</Badge>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setPreference("defaultHouse", item.id)}
                >
                  {t("Make default", "Tornar padrão", "Predeterminar")}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(houseLink(item.id))}
              >
                {t("Open", "Abrir", "Abrir")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {house && (
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
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("This month", "Este mês", "Este mes")}</CardTitle>
          <p className="text-3xl font-semibold tabular-nums">
            {money(cents / 100)}
          </p>
        </CardHeader>
        <CardContent>
          {summary.expenses.length === 0 ? (
            <p className="text-muted-foreground">
              {t(
                "No expenses this month.",
                "Nenhuma despesa neste mês.",
                "No hay gastos este mes.",
              )}
            </p>
          ) : (
            <div
              className="flex items-end gap-1"
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
                  className="flex min-w-0 flex-1 flex-col items-center gap-2"
                >
                  <div className="flex h-28 w-full max-w-16 items-end rounded bg-muted">
                    <div
                      className="w-full rounded bg-primary"
                      style={{ height: `${(amount / max) * 100}%` }}
                    />
                  </div>
                  <span className="h-4 text-xs text-muted-foreground">
                    {i === 0 || (i + 1) % 5 === 0 || i === daily.length - 1
                      ? i + 1
                      : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
          {summary.expenses.length > 0 && (
            <ul
              aria-label={t(
                "Recent expenses",
                "Despesas recentes",
                "Gastos recientes",
              )}
              className="mt-4 divide-y"
            >
              {summary.expenses.slice(0, 3).map((expense) => (
                <li key={expense.id} className="flex justify-between gap-3 py-2">
                  <span className="min-w-0 truncate">{expense.description}</span>
                  <span className="shrink-0 tabular-nums">
                    {money(expense.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("Upcoming", "Próximos", "Próximos")}</CardTitle>
        </CardHeader>
        <CardContent>
          {summary.events.length === 0 ? (
            <p className="text-muted-foreground">
              {t(
                "No upcoming events.",
                "Nenhum evento próximo.",
                "No hay eventos próximos.",
              )}
            </p>
          ) : (
            <ul className="divide-y">
              {summary.events.map((event, i) => (
                <li
                  key={i}
                  className="flex flex-wrap justify-between gap-3 py-3"
                >
                  <div>
                    <p className="font-medium">{event.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {Number.isNaN(Date.parse(event.when))
                        ? event.when
                        : new Date(event.when).toLocaleString(locale)}
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {event.kind === "calendar"
                      ? t("Calendar", "Calendário", "Calendario")
                      : event.kind === "chore"
                        ? t("Chore", "Tarefa", "Tarea")
                        : t("Reminder", "Lembrete", "Recordatorio")}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            setPaused(false);
        }}
      >
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>
            {t("House notes", "Notas da casa", "Notas de la casa")}
          </CardTitle>
          <Button
            variant="ghost"
            onClick={() => navigate(houseLink(house.id, "notes"))}
          >
            {t("Open notes", "Abrir notas", "Abrir notas")}
          </Button>
        </CardHeader>
        <CardContent>
          {!note ? (
            <p className="text-muted-foreground">
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
              <h3 className="text-lg font-semibold">{note.title}</h3>
              <p className="mt-2 line-clamp-4 whitespace-pre-wrap">
                {note.content}
              </p>
              {summary.notes.length > 1 && (
                <div className="mt-4 flex items-center justify-between gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setIndex(
                        (value) =>
                          (value + summary.notes.length - 1) %
                          summary.notes.length,
                      )
                    }
                  >
                    {t("Previous", "Anterior", "Anterior")}
                  </Button>
                  <span className="text-sm">
                    {(index % summary.notes.length) + 1} /{" "}
                    {summary.notes.length}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setIndex((value) => (value + 1) % summary.notes.length)
                    }
                  >
                    {t("Next", "Próxima", "Siguiente")}
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
