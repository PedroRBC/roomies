import { Button } from "@/components/ui/button";
import { houseLink } from "@/lib/navigation";
import { usePreferences } from "@/lib/preferences";
import type { ScheduledEvent } from "./notifications-model";
export interface AgendaEntry {
  id: string;
  title: string;
  kind: "calendar" | "chore" | "schedule";
  when: string;
  timezone: string;
  all_day: boolean;
}
export interface Agenda {
  entries: AgendaEntry[];
  truncated: boolean;
}
export function DashboardAgenda({
  agenda,
  reminders,
  houseId,
  navigate,
  now,
  onOpen,
}: {
  agenda?: Agenda;
  reminders: ScheduledEvent[];
  houseId: string;
  navigate: (path: string) => void;
  now: number;
  onOpen?: (tab: "calendar" | "chores" | "notifications") => void;
}) {
  const { t, locale } = usePreferences();
  const until = now + 31 * 24 * 60 * 60 * 1000;
  const entries = [
    ...(agenda?.entries ?? []),
    ...reminders
      .filter(
        (e) =>
          e.enabled &&
          e.next_occurrence_at &&
          Date.parse(e.next_occurrence_at) >= now &&
          Date.parse(e.next_occurrence_at) < until,
      )
      .map((e) => ({
        id: e.id,
        title: e.title,
        kind: "schedule" as const,
        when: e.next_occurrence_at!,
        timezone: e.timezone,
        all_day: false,
      })),
  ]
    .sort((a, b) => Date.parse(a.when) - Date.parse(b.when))
    .slice(0, 6);
  const kind = (value: string) =>
    value === "calendar"
      ? t("Calendar", "Calendário", "Calendario")
      : value === "chore"
        ? t("Chore", "Tarefa", "Tarea")
        : t("Reminder", "Lembrete", "Recordatorio");
  return (
    <section aria-label={t("Upcoming", "Próximos", "Próximos")}>
      <div>
        <h2 className="font-heading text-2xl font-semibold">
          {t("Upcoming", "Próximos", "Próximos")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t(
            "Your next six events, chores and reminders.",
            "Seus próximos seis eventos, tarefas e lembretes.",
            "Tus próximos seis eventos, tareas y recordatorios.",
          )}
        </p>
      </div>
      <div className="mt-4">
        {!agenda && (
          <p role="status" className="mb-3 text-sm text-muted-foreground">
            {t(
              "Calendar and chore agenda unavailable. Refresh to retry.",
              "Agenda do calendário e tarefas indisponível. Atualize para tentar novamente.",
              "Agenda de calendario y tareas no disponible. Actualiza para reintentar.",
            )}
          </p>
        )}
        {entries.length ? (
          <ul className="divide-y">
            {entries.map((e) => (
              <li
                key={`${e.kind}/${e.id}/${e.when}`}
                className="flex flex-wrap items-start justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <button
                    type="button"
                    className="text-left font-semibold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                    onClick={() => {
                      const tab =
                        e.kind === "chore"
                          ? "chores"
                          : e.kind === "calendar"
                            ? "calendar"
                            : "notifications";
                      if (onOpen) onOpen(tab);
                      else navigate(houseLink(houseId, tab));
                    }}
                  >
                    {e.title}
                  </button>
                  <p className="text-sm text-muted-foreground">
                    {kind(e.kind)}
                  </p>
                </div>
                <time
                  dateTime={e.when}
                  className="text-sm text-muted-foreground"
                >
                  {e.all_day
                    ? new Date(e.when).toLocaleDateString(locale, {
                        timeZone: e.timezone,
                      })
                    : new Date(e.when).toLocaleString(locale)}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          agenda && (
            <p className="text-sm text-muted-foreground">
              {t(
                "Nothing coming up.",
                "Nada agendado por agora.",
                "Nada programado por ahora.",
              )}
            </p>
          )
        )}
        {agenda?.truncated && (
          <p className="text-sm text-muted-foreground">
            {t(
              "Agenda limited to the first 200 occurrences. Open each section for all schedules.",
              "Agenda limitada às primeiras 200 ocorrências. Abra cada seção para ver os agendamentos.",
              "Agenda limitada a las primeras 200 ocurrencias. Abre cada sección para ver las programaciones.",
            )}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {(["calendar", "chores"] as const).map((tab) => (
            <Button
              key={tab}
              variant="outline"
              onClick={() => navigate(houseLink(houseId, tab))}
            >
              {tab === "calendar"
                ? t("Open calendar", "Abrir calendário", "Abrir calendario")
                : t("Open chores", "Abrir tarefas", "Abrir tareas")}
            </Button>
          ))}
        </div>
      </div>
    </section>
  );
}
