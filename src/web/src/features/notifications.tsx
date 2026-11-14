import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Globe, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Field } from "@/components/field";
import { api, ApiError } from "@/lib/api";
import { housePath } from "@/lib/features";
import type { FeatureProps } from "@/lib/features";
import { usePreferences } from "@/lib/preferences";
import {
  buildEventRequest,
  emptyEvent,
  eventDraft,
  minutesTime,
  timeMinutes,
  validatePreferences,
} from "./notifications-model";
import type {
  EventDraft,
  NotificationPreferences,
  NotificationSubscription,
  ScheduledEvent,
} from "./notifications-model";
import {
  browserPushState,
  requestBrowserPushPermission,
  subscribeBrowserPush,
  unsubscribeBrowserPush,
} from "./notifications-push";

function Check({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex min-h-14 items-center gap-3 [&_label]:text-base [&_label]:font-normal">
      <Checkbox
        id={id}
        disabled={disabled}
        checked={checked}
        onCheckedChange={onChange}
      />
      <Label htmlFor={id}>{label}</Label>
    </div>
  );
}
function Choice({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  options: [string, string][];
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select
        disabled={disabled}
        value={value}
        onValueChange={(v) => {
          if (v) onChange(v);
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue>
            {options.find(([key]) => key === value)?.[1] ?? value}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map(([key, text]) => (
            <SelectItem key={key} value={key}>
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="gap-4 p-5">
      <h3 className="text-[19px] font-bold tracking-[-0.1px]">{title}</h3>
      {children}
    </Card>
  );
}

export function Notifications(props: FeatureProps) {
  // Remount drafts and request guards together whenever the house or account changes.
  return (
    <NotificationSettings
      key={`${props.houseId}:${props.user.id}`}
      {...props}
    />
  );
}
function NotificationSettings({
  houseId,
  user,
  role,
  onUnauthorized,
  onChanged,
}: FeatureProps) {
  const { t, locale } = usePreferences();
  const base = housePath(houseId);
  const live = useRef(false);
  const locked = useRef(false);
  const callbacks = useRef({ onUnauthorized, onChanged });
  useEffect(() => {
    callbacks.current = { onUnauthorized, onChanged };
  }, [onUnauthorized, onChanged]);
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [subscriptions, setSubscriptions] = useState<
    NotificationSubscription[]
  >([]);
  const [events, setEvents] = useState<ScheduledEvent[]>([]);
  const [draft, setDraft] = useState<EventDraft>({ ...emptyEvent });
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [pushStatus, setPushStatus] = useState("");
  const [localResetNeeded, setLocalResetNeeded] = useState(false);
  const [deviceLabel, setDeviceLabel] = useState("");
  const [confirmation, setConfirmation] = useState<{
    kind: "event" | "device" | "push" | "reset";
    id: string;
    title: string;
  } | null>(null);
  const canCreate = role === "admin" || role === "member";
  const canEdit = (event: ScheduledEvent) =>
    canCreate && (role === "admin" || event.creator_id === user.id);
  const activeWeb = subscriptions.filter(
    (s) => s.platform === "web_push" && !s.revoked_at,
  );
  const [capability, setCapability] = useState(browserPushState);

  useEffect(() => {
    live.current = true;
    const refreshCapability = () => setCapability(browserPushState());
    window.addEventListener("focus", refreshCapability);
    return () => {
      live.current = false;
      window.removeEventListener("focus", refreshCapability);
    };
  }, []);
  useEffect(() => {
    let active = true;
    Promise.all([
      api<NotificationPreferences>(`${base}/notification-preferences`),
      api<NotificationSubscription[]>(`${base}/notification-subscriptions`),
      api<ScheduledEvent[]>(`${base}/scheduled-events`),
    ])
      .then(([preferences, devices, scheduled]) => {
        if (!active) return;
        setPrefs({
          ...preferences,
          quiet_start_minutes: preferences.quiet_start_minutes ?? null,
          quiet_end_minutes: preferences.quiet_end_minutes ?? null,
        });
        setSubscriptions(devices);
        setEvents(
          scheduled.map((event) => ({
            ...event,
            exdates: event.exdates ?? [],
          })),
        );
      })
      .catch((err: unknown) => {
        if (!active) return;
        setLoadError(true);
        if (err instanceof ApiError && err.status === 401)
          callbacks.current.onUnauthorized();
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [base, retry]);

  function validationMessage(code: string) {
    switch (code) {
      case "timezone":
        return t(
          "Enter a valid IANA timezone, such as Europe/Lisbon.",
          "Informe um fuso horário IANA válido, como America/Sao_Paulo.",
          "Introduce una zona horaria IANA válida, como Europe/Madrid.",
        );
      case "title":
        return t(
          "Enter a title; shorten it if needed.",
          "Informe um título; encurte-o se necessário.",
          "Introduce un título; acórtalo si es necesario.",
        );
      case "quiet":
        return t(
          "Quiet hours require both start and end, or both empty.",
          "Informe o início e o fim do horário silencioso, ou deixe ambos vazios.",
          "Indica el inicio y el fin de las horas de silencio, o deja ambos vacíos.",
        );
      case "time":
        return t(
          "Enter a valid local time.",
          "Informe um horário local válido.",
          "Introduce una hora local válida.",
        );
      case "date":
        return t(
          "Enter valid local dates and times, including exception dates.",
          "Informe datas e horários locais válidos, inclusive nas exceções.",
          "Introduce fechas y horas locales válidas, incluidas las excepciones.",
        );
      case "interval":
      case "count":
        return t(
          "Interval and count must be integers from 1 to 366.",
          "O intervalo e a quantidade devem ser inteiros de 1 a 366.",
          "El intervalo y la cantidad deben ser enteros entre 1 y 366.",
        );
      case "until":
        return t(
          "Until must be a valid date after the start, within one year.",
          "A data final deve ser válida, posterior ao início e dentro de um ano.",
          "La fecha final debe ser válida, posterior al inicio y dentro de un año.",
        );
      case "bounded":
        return t(
          "Provide a count or an until date.",
          "Informe uma quantidade ou data final.",
          "Indica una cantidad o una fecha final.",
        );
      case "exceptions":
        return t(
          "At most 100 exception dates are allowed.",
          "São permitidas até 100 datas de exceção.",
          "Se permiten hasta 100 fechas de excepción.",
        );
      default:
        return t(
          "Check the delivery and recurrence settings.",
          "Confira as configurações de entrega e recorrência.",
          "Revisa los ajustes de entrega y recurrencia.",
        );
    }
  }
  function pushMessage(code: string) {
    switch (code) {
      case "unsupported":
        return t(
          "This browser does not support Web Push.",
          "Este navegador não oferece suporte a Web Push.",
          "Este navegador no admite Web Push.",
        );
      case "insecure":
        return t(
          "Web Push requires HTTPS or localhost.",
          "Web Push requer HTTPS ou localhost.",
          "Web Push requiere HTTPS o localhost.",
        );
      case "denied":
        return t(
          "Notifications are blocked. Allow them in browser settings to enable push.",
          "As notificações estão bloqueadas. Permita-as nas configurações do navegador para ativar o push.",
          "Las notificaciones están bloqueadas. Permítelas en los ajustes del navegador para activar push.",
        );
      case "dismissed":
        return t(
          "Notification permission was not granted. You can try again.",
          "A permissão de notificações não foi concedida. Você pode tentar novamente.",
          "No se concedió permiso para notificaciones. Puedes intentarlo de nuevo.",
        );
      case "unconfigured":
        return t(
          "Browser push is not configured by this server.",
          "O push do navegador não está configurado neste servidor.",
          "El push del navegador no está configurado en este servidor.",
        );
      case "keyChanged":
        return t(
          "The server push key changed. Reset browser push, then enable it again.",
          "A chave de push do servidor mudou. Redefina o push do navegador e ative-o novamente.",
          "La clave push del servidor cambió. Restablece push del navegador y vuelve a activarlo.",
        );
      default:
        return t(
          "Could not update browser push. Check your connection and try again.",
          "Não foi possível atualizar o push. Confira sua conexão e tente novamente.",
          "No se pudo actualizar push. Comprueba tu conexión e inténtalo de nuevo.",
        );
    }
  }
  async function run(action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await action();
    } catch (err) {
      if (!live.current) return;
      if (err instanceof ApiError && err.status === 401)
        callbacks.current.onUnauthorized();
      setError(
        err instanceof ApiError && err.status === 403
          ? t(
              "You do not have permission for this action.",
              "Você não tem permissão para esta ação.",
              "No tienes permiso para esta acción.",
            )
          : err instanceof ApiError && err.status === 409
            ? t(
                "This item changed. Reload before trying again.",
                "Este item mudou. Recarregue antes de tentar novamente.",
                "Este elemento cambió. Recarga antes de intentarlo de nuevo.",
              )
            : t(
                "Could not save changes. Your form has been kept; please try again.",
                "Não foi possível salvar. Seu formulário foi mantido; tente novamente.",
                "No se pudieron guardar los cambios. Se conservó el formulario; inténtalo de nuevo.",
              ),
      );
    } finally {
      locked.current = false;
      if (live.current) {
        setBusy(false);
        setCapability(browserPushState());
      }
    }
  }
  function changed() {
    setStatus(t("Changes saved.", "Alterações salvas.", "Cambios guardados."));
    callbacks.current.onChanged?.();
  }
  function updatePref<K extends keyof NotificationPreferences>(
    key: K,
    value: NotificationPreferences[K],
  ) {
    setPrefs((current) => (current ? { ...current, [key]: value } : current));
  }
  function updateDraft<K extends keyof EventDraft>(
    key: K,
    value: EventDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  function savePreferences() {
    if (!prefs || locked.current) return;
    const value = {
      ...prefs,
      timezone: prefs.timezone.trim(),
      quiet_start_minutes: prefs.quiet_start_minutes ?? null,
      quiet_end_minutes: prefs.quiet_end_minutes ?? null,
    };
    try {
      validatePreferences(value);
    } catch (err) {
      setError(validationMessage((err as Error).message));
      return;
    }
    void run(async () => {
      const saved = await api<NotificationPreferences>(
        `${base}/notification-preferences`,
        { method: "PUT", body: JSON.stringify(value) },
      );
      if (!live.current) return;
      setPrefs({
        ...saved,
        quiet_start_minutes: saved.quiet_start_minutes ?? null,
        quiet_end_minutes: saved.quiet_end_minutes ?? null,
      });
      changed();
    });
  }
  function saveEvent() {
    if (!canCreate || locked.current) return;
    if (
      editing &&
      !events.some((event) => event.id === editing && canEdit(event))
    )
      return;
    let request;
    try {
      request = buildEventRequest(draft);
    } catch (err) {
      setError(validationMessage((err as Error).message));
      return;
    }
    void run(async () => {
      const saved = await api<ScheduledEvent>(
        `${base}/scheduled-events${editing ? `/${encodeURIComponent(editing)}` : ""}`,
        { method: editing ? "PUT" : "POST", body: JSON.stringify(request) },
      );
      if (!live.current) return;
      setEvents((current) =>
        current.some((event) => event.id === saved.id)
          ? current.map((event) =>
              event.id === saved.id
                ? { ...saved, exdates: saved.exdates ?? [] }
                : event,
            )
          : [...current, { ...saved, exdates: saved.exdates ?? [] }],
      );
      setEditing(null);
      setDraft({ ...emptyEvent });
      changed();
    });
  }
  function enablePush() {
    void run(async () => {
      try {
        // Request permission before network calls to preserve the browser user gesture.
        await requestBrowserPushPermission();
        if (!live.current) return;
        const key = await api<{ public_key: string }>(
          "/notifications/vapid-public-key",
        );
        if (!live.current) return;
        const body = await subscribeBrowserPush(
          key.public_key,
          deviceLabel.trim() || t("Browser", "Navegador", "Navegador"),
        );
        if (!live.current) return;
        await api<NotificationSubscription>(
          `${base}/notification-subscriptions`,
          { method: "POST", body: JSON.stringify(body) },
        );
        if (!live.current) return;
        const devices = await api<NotificationSubscription[]>(
          `${base}/notification-subscriptions`,
        );
        if (!live.current) return;
        setSubscriptions(devices);
        setPushStatus(
          t(
            "Browser push enabled.",
            "Push do navegador ativado.",
            "Push del navegador activado.",
          ),
        );
        changed();
      } catch (err) {
        if (err instanceof ApiError) throw err;
        if (live.current) {
          setPushStatus(pushMessage((err as Error).message));
          if ((err as Error).message === "keyChanged")
            setLocalResetNeeded(true);
        }
      }
    });
  }
  function removeConfirmed() {
    if (!confirmation || locked.current) return;
    const target = confirmation;
    void run(async () => {
      if (target.kind === "event") {
        if (!events.some((event) => event.id === target.id && canEdit(event)))
          return;
        await api(`${base}/scheduled-events/${encodeURIComponent(target.id)}`, {
          method: "DELETE",
        });
        if (!live.current) return;
        setEvents((current) =>
          current.filter((event) => event.id !== target.id),
        );
        if (editing === target.id) {
          setEditing(null);
          setDraft({ ...emptyEvent });
        }
      } else if (target.kind === "reset") {
        await unsubscribeBrowserPush();
        if (!live.current) return;
        setLocalResetNeeded(false);
        setPushStatus(
          t(
            "Browser push reset. Enable push again for each house.",
            "Push do navegador redefinido. Ative o push novamente em cada casa.",
            "Push del navegador restablecido. Activa push de nuevo en cada casa.",
          ),
        );
      } else {
        const ids =
          target.kind === "push" ? activeWeb.map((s) => s.id) : [target.id];
        for (const id of ids) {
          if (!live.current) return;
          await api(
            `${base}/notification-subscriptions/${encodeURIComponent(id)}`,
            { method: "DELETE" },
          );
          if (!live.current) return;
          setSubscriptions((current) =>
            current.map((s) =>
              s.id === id ? { ...s, revoked_at: new Date().toISOString() } : s,
            ),
          );
        }
        if (target.kind === "push") {
          setPushStatus(
            t(
              "Browser push disabled.",
              "Push do navegador desativado.",
              "Push del navegador desactivado.",
            ),
          );
        }
      }
      setConfirmation(null);
      changed();
    });
  }
  const localDisplay = (value: string) => {
    const normalized = value.length === 16 ? `${value}:00` : value;
    const date = new Date(`${normalized}Z`);
    return Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat(locale, {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "UTC",
        }).format(date)
      : value;
  };
  function recurrenceDisplay(event: ScheduledEvent) {
    const rule = eventDraft(event);
    const frequency =
      rule.frequency === "DAILY"
        ? t("Daily", "Diária", "Diaria")
        : rule.frequency === "WEEKLY"
          ? t("Weekly", "Semanal", "Semanal")
          : t("Monthly", "Mensal", "Mensual");
    return [
      frequency,
      `${t("interval", "intervalo", "intervalo")} ${rule.interval}`,
      rule.count && `${rule.count} ${t("times", "vezes", "veces")}`,
      rule.until && `${t("until", "até", "hasta")} ${rule.until}`,
      rule.extras,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  const instantDisplay = (value: string, timezone?: string) => {
    const date = new Date(value);
    try {
      return new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: timezone,
      }).format(date);
    } catch {
      return value;
    }
  };

  if (loading)
    return (
      <p role="status">
        {t(
          "Loading notification settings…",
          "Carregando configurações de notificações…",
          "Cargando ajustes de notificaciones…",
        )}
      </p>
    );
  if (loadError || !prefs)
    return (
      <div className="space-y-3">
        <p role="alert">
          {t(
            "Unable to load notification settings.",
            "Não foi possível carregar as configurações de notificações.",
            "No se pudieron cargar los ajustes de notificaciones.",
          )}
        </p>
        <Button
          onClick={() => {
            setLoading(true);
            setLoadError(false);
            setRetry((n) => n + 1);
          }}
        >
          {t("Retry", "Tentar novamente", "Reintentar")}
        </Button>
      </div>
    );
  return (
    <section
      className="space-y-6"
      aria-label={t(
        "Notifications and schedule",
        "Notificações e agenda",
        "Notificaciones y agenda",
      )}
    >
      <h2 className="roomies-page-title">
        {t(
          "Notifications and schedule",
          "Notificações e agenda",
          "Notificaciones y agenda",
        )}
      </h2>
      {error && !confirmation && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {status && <p role="status">{status}</p>}
      <Panel
        title={t(
          "Your notification preferences",
          "Suas preferências de notificações",
          "Tus preferencias de notificaciones",
        )}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            savePreferences();
          }}
        >
          <fieldset disabled={busy} className="grid gap-6">
            <legend className="sr-only">
              {t(
                "Alert settings",
                "Configurações de alertas",
                "Ajustes de alertas",
              )}
            </legend>
            <div>
              <h4 className="mb-3 text-xs font-bold tracking-[0.8px] text-muted-foreground uppercase">
                {t("Alerts", "Alertas", "Alertas")}
              </h4>
              <Check
                disabled={busy}
                label={t(
                  "Shared expense alerts",
                  "Alertas de despesas compartilhadas",
                  "Alertas de gastos compartidos",
                )}
                checked={prefs.expense_created_enabled}
                onChange={(value) =>
                  updatePref("expense_created_enabled", value)
                }
              />
              <Check
                disabled={busy}
                label={t(
                  "Scheduled reminder alerts",
                  "Alertas de lembretes agendados",
                  "Alertas de recordatorios programados",
                )}
                checked={prefs.reminder_enabled}
                onChange={(value) => updatePref("reminder_enabled", value)}
              />
            </div>
            <div>
              <h4 className="mb-3 text-xs font-bold tracking-[0.8px] text-muted-foreground uppercase">
                {t("Timing", "Horário", "Horario")}
              </h4>
              <div className="grid gap-4 sm:grid-cols-2">
                <Choice
                  disabled={busy}
                  label={t("Delivery", "Entrega", "Entrega")}
                  value={prefs.cadence}
                  onChange={(value) => updatePref("cadence", value)}
                  options={[
                    ["immediate", t("Immediate", "Imediata", "Inmediata")],
                    [
                      "daily_digest",
                      t("Daily digest", "Resumo diário", "Resumen diario"),
                    ],
                  ]}
                />
                <Field
                  label={t(
                    "Preference timezone",
                    "Fuso horário das preferências",
                    "Zona horaria de preferencias",
                  )}
                  value={prefs.timezone}
                  onChange={(e) => updatePref("timezone", e.target.value)}
                  required
                  placeholder="Europe/Lisbon"
                />
              </div>
            </div>
            <div>
              <h4 className="mb-3 text-xs font-bold tracking-[0.8px] text-muted-foreground uppercase">
                {t(
                  "Quiet hours and digest",
                  "Silêncio e resumo",
                  "Silencio y resumen",
                )}
              </h4>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field
                  type="time"
                  label={t(
                    "Quiet start (local)",
                    "Início do silêncio (local)",
                    "Inicio del silencio (local)",
                  )}
                  value={minutesTime(prefs.quiet_start_minutes)}
                  onChange={(e) =>
                    updatePref(
                      "quiet_start_minutes",
                      timeMinutes(e.target.value),
                    )
                  }
                />
                <Field
                  type="time"
                  label={t(
                    "Quiet end (local)",
                    "Fim do silêncio (local)",
                    "Fin del silencio (local)",
                  )}
                  value={minutesTime(prefs.quiet_end_minutes)}
                  onChange={(e) =>
                    updatePref("quiet_end_minutes", timeMinutes(e.target.value))
                  }
                />
                <Field
                  type="time"
                  label={t(
                    "Daily digest time (local)",
                    "Horário do resumo diário (local)",
                    "Hora del resumen diario (local)",
                  )}
                  required
                  value={minutesTime(prefs.digest_minutes)}
                  onChange={(e) =>
                    updatePref(
                      "digest_minutes",
                      timeMinutes(e.target.value) ?? -1,
                    )
                  }
                />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {t(
                "Quiet hours use this timezone. Clear both times to disable quiet hours.",
                "O horário silencioso usa este fuso. Limpe os dois horários para desativá-lo.",
                "Las horas de silencio usan esta zona horaria. Borra ambas horas para desactivarlas.",
              )}
            </p>
            <Button type="submit" className="w-fit">
              {t(
                "Save preferences",
                "Salvar preferências",
                "Guardar preferencias",
              )}
            </Button>
          </fieldset>
        </form>
      </Panel>
      <Panel
        title={t("Browser push", "Push do navegador", "Push del navegador")}
      >
        <p className="text-sm text-muted-foreground">
          {t(
            "Enable notifications on this browser for this house.",
            "Ative as notificações neste navegador para esta casa.",
            "Activa las notificaciones en este navegador para esta casa.",
          )}
        </p>
        {["insecure", "unsupported", "denied"].includes(capability) && (
          <p role="status">{pushMessage(capability)}</p>
        )}
        <fieldset disabled={busy} className="grid gap-3">
          <Field
            label={t(
              "Device label",
              "Nome do dispositivo",
              "Nombre del dispositivo",
            )}
            maxLength={120}
            value={deviceLabel}
            onChange={(e) => setDeviceLabel(e.target.value)}
            placeholder={t("Browser", "Navegador", "Navegador")}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={enablePush}
              disabled={["insecure", "unsupported", "denied"].includes(
                capability,
              )}
            >
              {t(
                "Enable on this browser",
                "Ativar neste navegador",
                "Activar en este navegador",
              )}
            </Button>
            {activeWeb.length > 0 && (
              <Button
                variant="outline"
                onClick={() => {
                  setError("");
                  setConfirmation({ kind: "push", id: "", title: "" });
                }}
              >
                {t(
                  "Disable browser push",
                  "Desativar push do navegador",
                  "Desactivar push del navegador",
                )}
              </Button>
            )}
            {localResetNeeded && (
              <Button
                variant="outline"
                onClick={() => {
                  setError("");
                  setConfirmation({ kind: "reset", id: "", title: "" });
                }}
              >
                {t(
                  "Reset browser push",
                  "Redefinir push do navegador",
                  "Restablecer push del navegador",
                )}
              </Button>
            )}
          </div>
        </fieldset>
        {pushStatus && <p role="status">{pushStatus}</p>}
        <h4 className="mt-2 border-t pt-6 text-base">
          {t("Your devices", "Seus dispositivos", "Tus dispositivos")}
        </h4>
        {subscriptions.length === 0 && (
          <p className="text-muted-foreground">
            {t(
              "No registered devices.",
              "Nenhum dispositivo registrado.",
              "No hay dispositivos registrados.",
            )}
          </p>
        )}
        <ul>
          {subscriptions.map((device) => (
            <li
              key={device.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div className="flex min-w-0 flex-1 items-start gap-2.5">
                {device.platform === "web_push" ? (
                  <Globe
                    className="mt-0.5 size-[18px] shrink-0"
                    aria-hidden="true"
                  />
                ) : (
                  <Smartphone
                    className="mt-0.5 size-[18px] shrink-0"
                    aria-hidden="true"
                  />
                )}
                <div className="min-w-0">
                  <p className="break-words">
                    {device.device_label ||
                      t(
                        "Unnamed device",
                        "Dispositivo sem nome",
                        "Dispositivo sin nombre",
                      )}{" "}
                    ·{" "}
                    {device.platform === "web_push"
                      ? t("Browser", "Navegador", "Navegador")
                      : t("Android", "Android", "Android")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("Last seen:", "Última atividade:", "Última actividad:")}{" "}
                    {instantDisplay(device.last_seen_at)} ·{" "}
                    {device.revoked_at
                      ? t("Disabled", "Desativado", "Desactivado")
                      : t("Active", "Ativo", "Activo")}
                  </p>
                </div>
              </div>
              {!device.revoked_at && (
                <Button
                  disabled={busy}
                  variant="outline"
                  onClick={() => {
                    setError("");
                    setConfirmation({
                      kind: "device",
                      id: device.id,
                      title: device.device_label,
                    });
                  }}
                >
                  {t(
                    "Revoke device",
                    "Revogar dispositivo",
                    "Revocar dispositivo",
                  )}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Panel>
      <Panel
        title={t(
          "Scheduled events",
          "Eventos agendados",
          "Eventos programados",
        )}
      >
        {events.length === 0 && (
          <p className="text-muted-foreground">
            {t(
              "No scheduled events.",
              "Nenhum evento agendado.",
              "No hay eventos programados.",
            )}
          </p>
        )}
        <div className="grid gap-3">
          {events.map((event) => (
            <article
              key={event.id}
              className="space-y-1 rounded-[18px] border bg-card p-5 shadow-sm"
            >
              <h4 className="text-base font-semibold">{event.title}</h4>
              <p className="text-sm">
                {localDisplay(event.dtstart_local)} · {event.timezone}
              </p>
              <p className="break-words text-sm text-muted-foreground">
                {t("Recurrence:", "Recorrência:", "Recurrencia:")}{" "}
                {recurrenceDisplay(event)}
              </p>
              {event.exdates.length > 0 && (
                <p className="text-sm">
                  {t("Exceptions:", "Exceções:", "Excepciones:")}{" "}
                  {event.exdates.map(localDisplay).join(", ")}
                </p>
              )}
              <p className="text-sm">
                {event.enabled
                  ? t("Enabled", "Ativado", "Activado")
                  : t("Disabled", "Desativado", "Desactivado")}{" "}
                ·{" "}
                {t(
                  "Next occurrence:",
                  "Próxima ocorrência:",
                  "Próxima ocurrencia:",
                )}{" "}
                {event.enabled && event.next_occurrence_at
                  ? `${instantDisplay(event.next_occurrence_at, event.timezone)} (${event.timezone})`
                  : t("None", "Nenhuma", "Ninguna")}
              </p>
              {canEdit(event) && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={busy}
                    variant="outline"
                    onClick={() => {
                      setEditing(event.id);
                      setDraft(eventDraft(event));
                      setError("");
                      setStatus("");
                    }}
                  >
                    {t("Edit", "Editar", "Editar")}
                  </Button>
                  <Button
                    disabled={busy}
                    variant="outline"
                    onClick={() => {
                      void run(async () => {
                        const saved = await api<ScheduledEvent>(
                          `${base}/scheduled-events/${encodeURIComponent(event.id)}`,
                          {
                            method: "PUT",
                            body: JSON.stringify({
                              title: event.title,
                              timezone: event.timezone,
                              dtstart_local: event.dtstart_local,
                              rrule: event.rrule,
                              exdates: event.exdates,
                              enabled: !event.enabled,
                            }),
                          },
                        );
                        if (!live.current) return;
                        setEvents((current) =>
                          current.map((item) =>
                            item.id === saved.id
                              ? { ...saved, exdates: saved.exdates ?? [] }
                              : item,
                          ),
                        );
                        if (editing === saved.id)
                          setDraft((current) => ({
                            ...current,
                            enabled: saved.enabled,
                          }));
                        changed();
                      });
                    }}
                  >
                    {event.enabled
                      ? t("Disable", "Desativar", "Desactivar")
                      : t("Enable", "Ativar", "Activar")}
                  </Button>
                  <Button
                    disabled={busy}
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => {
                      setError("");
                      setConfirmation({
                        kind: "event",
                        id: event.id,
                        title: event.title,
                      });
                    }}
                  >
                    {t("Delete", "Excluir", "Eliminar")}
                  </Button>
                </div>
              )}
            </article>
          ))}
        </div>
        {canCreate ? (
          <form
            className="mt-2 border-t pt-6"
            onSubmit={(e) => {
              e.preventDefault();
              saveEvent();
            }}
          >
            <fieldset disabled={busy} className="grid gap-4">
              <legend className="mb-4 text-base">
                {editing
                  ? t(
                      "Edit scheduled event",
                      "Editar evento agendado",
                      "Editar evento programado",
                    )
                  : t(
                      "Add scheduled event",
                      "Adicionar evento agendado",
                      "Añadir evento programado",
                    )}
              </legend>
              <div>
                <h4 className="mb-3 text-xs font-bold tracking-[0.8px] text-muted-foreground uppercase">
                  {t("Event", "Evento", "Evento")}
                </h4>
                <div className="grid gap-4">
                  <Field
                    label={t("Title", "Título", "Título")}
                    required
                    maxLength={120}
                    value={draft.title}
                    onChange={(e) => updateDraft("title", e.target.value)}
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      type="datetime-local"
                      step="1"
                      label={t("Local start", "Início local", "Inicio local")}
                      required
                      value={draft.start}
                      onChange={(e) => updateDraft("start", e.target.value)}
                    />
                    <Field
                      label={t(
                        "Event timezone",
                        "Fuso horário do evento",
                        "Zona horaria del evento",
                      )}
                      required
                      value={draft.timezone}
                      onChange={(e) => updateDraft("timezone", e.target.value)}
                      placeholder="Europe/Lisbon"
                    />
                  </div>
                </div>
              </div>
              <div className="mt-2">
                <h4 className="mb-3 text-xs font-bold tracking-[0.8px] text-muted-foreground uppercase">
                  {t("Repeats", "Repetição", "Repetición")}
                </h4>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Choice
                    disabled={busy}
                    label={t("Frequency", "Frequência", "Frecuencia")}
                    value={draft.frequency}
                    onChange={(value) => updateDraft("frequency", value)}
                    options={[
                      ["DAILY", t("Daily", "Diária", "Diaria")],
                      ["WEEKLY", t("Weekly", "Semanal", "Semanal")],
                      ["MONTHLY", t("Monthly", "Mensal", "Mensual")],
                    ]}
                  />
                  <Field
                    type="number"
                    min="1"
                    max="366"
                    step="1"
                    label={t(
                      "Interval (1–366)",
                      "Intervalo (1–366)",
                      "Intervalo (1–366)",
                    )}
                    required
                    value={draft.interval}
                    onChange={(e) => updateDraft("interval", e.target.value)}
                  />
                  <Field
                    type="number"
                    min="1"
                    max="366"
                    step="1"
                    label={t(
                      "Count (1–366, optional)",
                      "Quantidade (1–366, opcional)",
                      "Cantidad (1–366, opcional)",
                    )}
                    value={draft.count}
                    onChange={(e) => updateDraft("count", e.target.value)}
                  />
                </div>
              </div>
              <div className="mt-2">
                <h4 className="mb-3 text-xs font-bold tracking-[0.8px] text-muted-foreground uppercase">
                  {t(
                    "Until and exceptions",
                    "Até e exceções",
                    "Hasta y excepciones",
                  )}
                </h4>
                <div className="grid gap-4">
                  <Field
                    label={t(
                      "Until (optional)",
                      "Data final (opcional)",
                      "Fecha final (opcional)",
                    )}
                    value={draft.until}
                    onChange={(e) => updateDraft("until", e.target.value)}
                    placeholder="2026-12-31T09:00"
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  {t(
                    "Provide a count or an until date within one year. Until accepts a local date-time or RFC 5545 (YYYYMMDDTHHMMSS, optionally Z for UTC).",
                    "Informe uma quantidade ou data final dentro de um ano. A data final aceita data e hora locais ou RFC 5545 (YYYYMMDDTHHMMSS, com Z opcional para UTC).",
                    "Indica una cantidad o fecha final dentro de un año. La fecha final acepta fecha y hora locales o RFC 5545 (YYYYMMDDTHHMMSS, con Z opcional para UTC).",
                  )}
                </p>
                <Field
                  label={t(
                    "Exception local times (comma-separated)",
                    "Horários locais de exceção (separados por vírgula)",
                    "Horas locales de excepción (separadas por comas)",
                  )}
                  value={draft.exdates}
                  onChange={(e) => updateDraft("exdates", e.target.value)}
                  placeholder="2026-12-25T09:00:00"
                />
              </div>
              {draft.extras && (
                <p className="break-words text-sm">
                  {t(
                    "Additional recurrence rules (preserved):",
                    "Regras adicionais de recorrência (preservadas):",
                    "Reglas adicionales de recurrencia (conservadas):",
                  )}{" "}
                  {draft.extras}
                </p>
              )}
              <Check
                disabled={busy}
                label={t("Event enabled", "Evento ativado", "Evento activado")}
                checked={draft.enabled}
                onChange={(value) => updateDraft("enabled", value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="submit">
                  {editing
                    ? t("Save event", "Salvar evento", "Guardar evento")
                    : t("Create event", "Criar evento", "Crear evento")}
                </Button>
                {editing && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditing(null);
                      setDraft({ ...emptyEvent });
                      setError("");
                    }}
                  >
                    {t("Cancel edit", "Cancelar edição", "Cancelar edición")}
                  </Button>
                )}
              </div>
            </fieldset>
          </form>
        ) : (
          <p>
            {t(
              "Monitors can only view scheduled events.",
              "Monitores podem apenas visualizar eventos agendados.",
              "Los monitores solo pueden ver eventos programados.",
            )}
          </p>
        )}
      </Panel>
      <AlertDialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirmation(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>
            {confirmation?.kind === "reset"
              ? t(
                  "Reset browser push?",
                  "Redefinir push do navegador?",
                  "¿Restablecer push del navegador?",
                )
              : confirmation?.kind === "event"
                ? t(
                    "Delete scheduled event?",
                    "Excluir evento agendado?",
                    "¿Eliminar evento programado?",
                  )
                : t(
                    "Disable notifications?",
                    "Desativar notificações?",
                    "¿Desactivar notificaciones?",
                  )}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {confirmation?.kind === "reset"
              ? t(
                  "This resets this browser's subscription for all houses. Enable push again for each house to receive notifications with the new server key.",
                  "Isso redefine a inscrição deste navegador em todas as casas. Ative o push novamente em cada casa para receber notificações com a nova chave do servidor.",
                  "Esto restablece la suscripción de este navegador en todas las casas. Activa push de nuevo en cada casa para recibir notificaciones con la nueva clave del servidor.",
                )
              : confirmation?.kind === "push"
                ? t(
                    "This revokes all your browser subscriptions for this house. Other houses keep receiving notifications.",
                    "Isso revoga suas inscrições de navegador nesta casa. As outras casas continuam recebendo notificações.",
                    "Se revocarán tus suscripciones de navegador de esta casa. Las otras casas seguirán recibiendo notificaciones.",
                  )
                : `${confirmation?.title ?? ""} — ${t("This action cannot be undone.", "Esta ação não pode ser desfeita.", "Esta acción no se puede deshacer.")}`}
          </AlertDialogDescription>
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>
              {t("Cancel", "Cancelar", "Cancelar")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              variant="destructive"
              onClick={removeConfirmed}
            >
              {confirmation?.kind === "reset"
                ? t("Reset", "Redefinir", "Restablecer")
                : confirmation?.kind === "event"
                  ? t("Delete", "Excluir", "Eliminar")
                  : t("Disable", "Desativar", "Desactivar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
