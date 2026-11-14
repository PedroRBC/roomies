import { useEffect, useState } from "react";
import type { SubmitEvent } from "react";
import { api, ApiError } from "@/lib/api";
import { housePath } from "@/lib/features";
import { houseLink } from "@/lib/navigation";
import { usePreferences } from "@/lib/preferences";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Field } from "@/components/field";
import { Choice } from "@/components/choice";
import { buildEventRequest, emptyEvent } from "./notifications-model";
import type { ScheduledEvent } from "./notifications-model";

export function DashboardAutomations({
  houseId,
  writable,
  events,
  refresh,
  navigate,
  onUnauthorized,
}: {
  houseId: string;
  writable: boolean;
  events: ScheduledEvent[];
  refresh: () => void;
  navigate: (path: string) => void;
  onUnauthorized: () => void;
}) {
  const { t, locale } = usePreferences();
  const [open, setOpen] = useState(false);
  const [frequency, setFrequency] = useState("WEEKLY");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const enabled = events.filter((e) => e.enabled);
  const upcoming = enabled
    .filter(
      (e) => e.next_occurrence_at && Date.parse(e.next_occurrence_at) >= now,
    )
    .sort(
      (a, b) =>
        Date.parse(a.next_occurrence_at!) - Date.parse(b.next_occurrence_at!),
    );
  async function create(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setError("");
    setBusy(true);
    setSaved(false);
    try {
      let body;
      try {
        body = buildEventRequest({
          ...emptyEvent,
          title: String(data.get("title") ?? ""),
          start: String(data.get("start") ?? ""),
          timezone: String(data.get("timezone") ?? ""),
          frequency,
          count: String(data.get("count") ?? ""),
          enabled: true,
        });
      } catch (err) {
        if (err instanceof Error && err.message === "title")
          throw new Error(
            t(
              "Use a title of 1–120 UTF-8 bytes (accented characters and emoji use more than one byte).",
              "Use um título de 1–120 bytes UTF-8 (acentos e emojis usam mais de um byte).",
              "Usa un título de 1–120 bytes UTF-8 (acentos y emojis usan más de un byte).",
            ),
          );
        throw new Error(
          t(
            "Check the title, start, timezone and number of occurrences (1–366).",
            "Confira título, início, fuso e número de ocorrências (1–366).",
            "Revisa título, inicio, zona y número de ocurrencias (1–366).",
          ),
        );
      }
      await api(`${housePath(houseId)}/scheduled-events`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setOpen(false);
      setSaved(true);
      refresh();
    } catch (err) {
      setError((err as Error).message);
      if (err instanceof ApiError && err.status === 401) onUnauthorized();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="gap-3">
      <CardHeader className="gap-2">
        <CardTitle className="font-sans text-base font-semibold">
          {t(
            "House automations",
            "Automações da casa",
            "Automatizaciones del hogar",
          )}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {t(
            "Recurring reminders run on the server, even when the app is closed. Delivery follows each member’s notification preferences and configured channels.",
            "Lembretes recorrentes rodam no servidor, mesmo com o app fechado. A entrega segue as preferências e os canais configurados de cada membro.",
            "Los recordatorios recurrentes se ejecutan en el servidor, incluso con la app cerrada. La entrega sigue las preferencias y los canales configurados de cada miembro.",
          )}
        </p>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-semibold">
            {t(
              `${enabled.length} enabled reminders`,
              `${enabled.length} lembretes habilitados`,
              `${enabled.length} recordatorios habilitados`,
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => navigate(houseLink(houseId, "notifications"))}
            >
              {t(
                "Reminders & daily digest",
                "Lembretes e resumo diário",
                "Recordatorios y resumen diario",
              )}
            </Button>
            {writable && (
              <Button
                onClick={() => {
                  setOpen((v) => !v);
                  setSaved(false);
                  setError("");
                }}
                disabled={busy}
                aria-expanded={open}
              >
                {t(
                  "New recurring reminder",
                  "Novo lembrete recorrente",
                  "Nuevo recordatorio recurrente",
                )}
              </Button>
            )}
          </div>
        </div>
        {saved && (
          <p role="status" className="text-sm text-primary">
            {t(
              "Recurring reminder created.",
              "Lembrete recorrente criado.",
              "Recordatorio recurrente creado.",
            )}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {open && (
          <form
            onSubmit={create}
            className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2"
          >
            <div className="sm:col-span-2">
              <Field
                label={t(
                  "Reminder title",
                  "Título do lembrete",
                  "Título del recordatorio",
                )}
                name="title"
                required
                maxLength={120}
                placeholder={t(
                  "Take the bins out",
                  "Colocar o lixo para fora",
                  "Sacar la basura",
                )}
              />
            </div>
            <Field
              label={t(
                "First occurrence",
                "Primeira ocorrência",
                "Primera ocurrencia",
              )}
              name="start"
              type="datetime-local"
              required
            />
            <Field
              label={t("Timezone", "Fuso horário", "Zona horaria")}
              name="timezone"
              required
              defaultValue={
                Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
              }
            />
            <Choice
              label={t("Repeat", "Repetir", "Repetir")}
              value={frequency}
              onChange={setFrequency}
              choices={[
                {
                  value: "DAILY",
                  label: t("Daily", "Diariamente", "Diariamente"),
                },
                {
                  value: "WEEKLY",
                  label: t("Weekly", "Semanalmente", "Semanalmente"),
                },
                {
                  value: "MONTHLY",
                  label: t("Monthly", "Mensalmente", "Mensualmente"),
                },
              ]}
            />
            <Field
              label={t(
                "Number of occurrences",
                "Número de ocorrências",
                "Número de ocurrencias",
              )}
              name="count"
              type="number"
              required
              min={1}
              max={366}
              defaultValue="12"
            />
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={busy}
              >
                {t("Cancel", "Cancelar", "Cancelar")}
              </Button>
              <Button type="submit" disabled={busy}>
                {busy
                  ? t("Saving…", "Salvando…", "Guardando…")
                  : t(
                      "Create reminder",
                      "Criar lembrete",
                      "Crear recordatorio",
                    )}
              </Button>
            </div>
          </form>
        )}
        {upcoming.length ? (
          <ul className="divide-y">
            {upcoming.slice(0, 5).map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap justify-between gap-2 py-3 text-sm"
              >
                <span className="font-semibold">{e.title}</span>
                <span className="text-muted-foreground">
                  {new Date(e.next_occurrence_at!).toLocaleString(locale)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t(
              "No future reminder occurrences scheduled.",
              "Nenhuma ocorrência futura de lembrete agendada.",
              "No hay próximas ocurrencias de recordatorios.",
            )}
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          {t(
            "Chores and calendar events keep their own recurring schedules.",
            "Tarefas e eventos do calendário mantêm seus próprios agendamentos recorrentes.",
            "Las tareas y los eventos del calendario mantienen sus propias programaciones recurrentes.",
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => navigate(houseLink(houseId, "chores"))}
          >
            {t(
              "Manage recurring chores",
              "Gerenciar tarefas recorrentes",
              "Gestionar tareas recurrentes",
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate(houseLink(houseId, "calendar"))}
          >
            {t("Open calendar", "Abrir calendário", "Abrir calendario")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
