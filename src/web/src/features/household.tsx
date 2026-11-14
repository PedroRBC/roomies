import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import { housePath, type FeatureProps } from "@/lib/features";
import { usePreferences } from "@/lib/preferences";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { defaultEnd, localDateTime, schedule } from "./household-dates";

interface Versioned {
  id: string;
  creator_id: string;
  version: number;
}
interface Grocery extends Versioned {
  name: string;
  quantity: string;
  unit: string;
  note: string;
  assignee_id?: string | null;
  checked: boolean;
  position: number;
}
interface Chore extends Versioned {
  title: string;
  description: string;
  assignee_id?: string | null;
  timezone: string;
  due_local: string;
  rrule: string;
  exdates: string[];
  enabled: boolean;
}
interface CalendarEvent extends Versioned {
  title: string;
  description: string;
  timezone: string;
  start_local: string;
  end_local: string;
  rrule: string;
  exdates: string[];
  all_day: boolean;
}
type Translate = ReturnType<typeof usePreferences>["t"];
const initialRule = "FREQ=WEEKLY;INTERVAL=1;COUNT=1";
const writable = (role: string | null) => role !== null && role !== "monitor";
const owned = (props: FeatureProps, item: Versioned) =>
  writable(props.role) &&
  (props.role === "admin" || props.user.id === item.creator_id);
const text = (data: FormData, key: string) =>
  String(data.get(key) ?? "").trim();

function errorMessage(error: unknown, t: Translate): string {
  if (error instanceof ApiError) {
    if (error.status === 401)
      return t(
        "Your session expired. Sign in again.",
        "Sua sessão expirou. Entre novamente.",
        "Tu sesión caducó. Inicia sesión de nuevo.",
      );
    if (error.status === 403)
      return t(
        "You no longer have permission for this action.",
        "Você não tem mais permissão para esta ação.",
        "Ya no tienes permiso para esta acción.",
      );
    if (error.status === 404)
      return t(
        "This item is no longer available. Refresh and try again.",
        "Este item não está mais disponível. Atualize e tente novamente.",
        "Este elemento ya no está disponible. Actualiza e inténtalo de nuevo.",
      );
    if (error.status === 409)
      return t(
        "This item changed. Review the refreshed list and try again.",
        "Este item mudou. Confira a lista atualizada e tente novamente.",
        "Este elemento cambió. Revisa la lista actualizada e inténtalo de nuevo.",
      );
    if (error.status === 400 || error.status === 422)
      return t(
        "Check the fields, timezone and recurrence, then try again.",
        "Confira os campos, o fuso horário e a recorrência e tente novamente.",
        "Revisa los campos, la zona horaria y la recurrencia e inténtalo de nuevo.",
      );
    if (error.status === 0)
      return t(
        "Unable to connect. Check your connection and try again.",
        "Não foi possível conectar. Confira sua conexão e tente novamente.",
        "No se pudo conectar. Revisa tu conexión e inténtalo de nuevo.",
      );
  }
  switch (error instanceof Error ? error.message : "") {
    case "name":
      return t(
        "Enter a name or title.",
        "Informe um nome ou título.",
        "Introduce un nombre o título.",
      );
    case "date":
      return t(
        "Enter a valid local date and time.",
        "Informe uma data e hora local válidas.",
        "Introduce una fecha y hora local válidas.",
      );
    case "range":
      return t(
        "End must be after start.",
        "O fim deve ser depois do início.",
        "El final debe ser posterior al inicio.",
      );
    case "timezone":
      return t(
        "Enter a valid IANA timezone, such as America/Sao_Paulo or UTC.",
        "Informe um fuso IANA válido, como America/Sao_Paulo ou UTC.",
        "Introduce una zona IANA válida, como America/Sao_Paulo o UTC.",
      );
    case "recurrence":
      return t(
        "Use DAILY, WEEKLY or MONTHLY with COUNT (1–366) or UNTIL; INTERVAL must be 1–366.",
        "Use DAILY, WEEKLY ou MONTHLY com COUNT (1–366) ou UNTIL; INTERVAL deve ser 1–366.",
        "Usa DAILY, WEEKLY o MONTHLY con COUNT (1–366) o UNTIL; INTERVAL debe ser 1–366.",
      );
    case "exceptions":
      return t(
        "Use at most 100 exception dates.",
        "Use no máximo 100 datas de exceção.",
        "Usa como máximo 100 fechas de excepción.",
      );
    default:
      return t(
        "Could not complete the request. Try again.",
        "Não foi possível concluir a solicitação. Tente novamente.",
        "No se pudo completar la solicitud. Inténtalo de nuevo.",
      );
  }
}

function useHousehold<T>(props: FeatureProps, resource: string) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [error, setError] = useState<unknown>(null);
  const [status, setStatus] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const alive = useRef(false);
  const request = useRef(0);
  const latestProps = useRef(props);
  useEffect(() => {
    latestProps.current = props;
  });
  const path = `${housePath(props.houseId)}/${resource}`;
  const load = useCallback(() => {
    const current = ++request.current;
    return api<T[]>(path)
      .then((result) => {
        if (alive.current && current === request.current) setItems(result);
      })
      .catch((failure: unknown) => {
        if (alive.current && current === request.current) {
          setLoadError(failure);
          if (failure instanceof ApiError && failure.status === 401)
            latestProps.current.onUnauthorized();
        }
      })
      .finally(() => {
        if (alive.current && current === request.current) setLoading(false);
      });
  }, [path]);
  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, [load]);
  function reload() {
    setLoading(true);
    setLoadError(null);
    return load();
  }
  async function mutate(action: () => Promise<unknown>) {
    if (
      lock.current ||
      loading ||
      loadError ||
      !writable(latestProps.current.role)
    )
      return false;
    lock.current = true;
    setBusy(true);
    setError(null);
    setStatus(false);
    try {
      await action();
      if (!alive.current) return false;
      setStatus(true);
      latestProps.current.onChanged?.();
      await reload();
      return alive.current;
    } catch (failure) {
      if (alive.current) {
        setError(failure);
        if (failure instanceof ApiError) {
          if (failure.status === 401) latestProps.current.onUnauthorized();
          if (failure.status === 409 || failure.status === 404) await reload();
          if (failure.status === 403) latestProps.current.onChanged?.();
        }
      }
      return false;
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return {
    items,
    loading,
    loadError,
    error,
    setError,
    status,
    busy,
    path,
    load: reload,
    mutate,
  };
}

function Field({
  label,
  children,
}: {
  label: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-base font-semibold">
        {label}
      </Label>
      {children(id)}
    </div>
  );
}
function Assignee({
  members,
  value,
  onChange,
}: Pick<FeatureProps, "members"> & {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = usePreferences();
  const unassigned = t("Unassigned", "Sem responsável", "Sin asignar");
  return (
    <Field label={t("Assignee", "Responsável", "Responsable")}>
      {(id) => (
        <Select value={value} onValueChange={(v) => onChange(v ?? "")}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue>
              {members.find((member) => member.user_id === value)?.user_name ??
                unassigned}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{unassigned}</SelectItem>
            {members.map((member) => (
              <SelectItem key={member.user_id} value={member.user_id}>
                {member.user_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </Field>
  );
}
function Feedback({
  state,
}: {
  state: Pick<
    ReturnType<typeof useHousehold>,
    "loading" | "loadError" | "error" | "load" | "status" | "busy"
  >;
}) {
  const { t } = usePreferences();
  const failure = state.loadError ?? state.error;
  if (!state.loading && failure == null && !state.status) return null;
  return (
    <div className="space-y-2">
      {state.loading && (
        <p role="status">{t("Loading…", "Carregando…", "Cargando…")}</p>
      )}
      {failure != null && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/35 bg-destructive/10 p-3.5 text-destructive"
        >
          {errorMessage(failure, t)}
        </p>
      )}
      {state.loadError != null && (
        <Button
          type="button"
          variant="outline"
          disabled={state.loading || state.busy}
          onClick={() => void state.load()}
        >
          {t("Retry", "Tentar novamente", "Reintentar")}
        </Button>
      )}
      {state.status && failure == null && !state.loading && (
        <p role="status">{t("Saved.", "Salvo.", "Guardado.")}</p>
      )}
    </div>
  );
}
function ReadOnly() {
  const { t } = usePreferences();
  return (
    <p className="text-sm text-muted-foreground">
      {t(
        "Your role has view-only access.",
        "Seu perfil tem acesso somente para leitura.",
        "Tu rol tiene acceso de solo lectura.",
      )}
    </p>
  );
}
function DeleteConfirmation({
  name,
  busy,
  disabled,
  error,
  onCancel,
  onDelete,
}: {
  name: string;
  busy: boolean;
  disabled: boolean;
  error: unknown;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const { t } = usePreferences();
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogTitle className="font-heading text-[22px] font-semibold leading-tight">
          {t("Delete", "Excluir", "Eliminar")} “{name}”?
        </AlertDialogTitle>
        <AlertDialogDescription>
          {t(
            "This action cannot be undone.",
            "Esta ação não pode ser desfeita.",
            "Esta acción no se puede deshacer.",
          )}
        </AlertDialogDescription>
        {error != null && (
          <p
            role="alert"
            className="rounded-xl border border-destructive/35 bg-destructive/10 p-3.5 text-destructive"
          >
            {errorMessage(error, t)}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} onClick={onCancel}>
            {t("Cancel", "Cancelar", "Cancelar")}
          </AlertDialogCancel>
          <Button
            type="button"
            variant="ghost"
            className="h-10 px-4 text-destructive hover:text-destructive"
            disabled={disabled}
            onClick={onDelete}
          >
            {t("Delete", "Excluir", "Eliminar")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Reset forms and pending requests together when the household or signed-in user changes.
export function Groceries(props: FeatureProps) {
  return (
    <GroceriesPanel key={`${props.houseId}:${props.user.id}`} {...props} />
  );
}
export function Chores(props: FeatureProps) {
  return (
    <SchedulePanel
      key={`${props.houseId}:${props.user.id}:chores`}
      {...props}
      kind="chores"
    />
  );
}
export function Calendar(props: FeatureProps) {
  return (
    <SchedulePanel
      key={`${props.houseId}:${props.user.id}:calendar`}
      {...props}
      kind="calendar"
    />
  );
}

function GroceriesPanel(props: FeatureProps) {
  const { t } = usePreferences();
  const state = useHousehold<Grocery>(props, "groceries");
  const [assignee, setAssignee] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const canWrite = writable(props.role);
  const selected = canWrite
    ? state.items.find((item) => item.id === deleteId)
    : undefined;
  const disabled = state.busy || state.loading || state.loadError != null;
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const name = text(data, "name");
    if (!name) {
      state.setError(new Error("name"));
      return;
    }
    const body = {
      name,
      quantity: text(data, "quantity"),
      unit: text(data, "unit"),
      note: text(data, "note"),
      assignee_id: assignee || null,
      position: 0,
    };
    if (
      await state.mutate(() =>
        api(state.path, { method: "POST", body: JSON.stringify(body) }),
      )
    ) {
      form.reset();
      setAssignee("");
    }
  }
  return (
    <section
      className="space-y-5"
      aria-label={t("Groceries", "Compras", "Compras")}
    >
      <h2 className="roomies-page-title">
        {t("Groceries", "Compras", "Compras")}
      </h2>
      <Feedback state={{ ...state, error: selected ? null : state.error }} />
      {!canWrite && <ReadOnly />}
      {canWrite && (
        <form onSubmit={create}>
          <fieldset disabled={disabled} className="grid gap-2.5">
            <Field label={t("Name", "Nome", "Nombre")}>
              {(id) => <Input id={id} name="name" required maxLength={160} />}
            </Field>
            <details>
              <summary className="cursor-pointer py-2 font-semibold text-primary">
                {t("More options", "Mais opções", "Más opciones")}
              </summary>
              <div className="grid gap-2.5 pt-2">
                <Assignee
                  members={props.members}
                  value={assignee}
                  onChange={setAssignee}
                />
                <Field label={t("Quantity", "Quantidade", "Cantidad")}>
                  {(id) => <Input id={id} name="quantity" maxLength={40} />}
                </Field>
                <Field label={t("Unit", "Unidade", "Unidad")}>
                  {(id) => <Input id={id} name="unit" maxLength={40} />}
                </Field>
                <div>
                  <Field label={t("Note", "Observação", "Nota")}>
                    {(id) => (
                      <Textarea id={id} name="note" maxLength={1000} rows={2} />
                    )}
                  </Field>
                </div>
              </div>
            </details>
            <Button type="submit" className="my-2 h-12 w-full">
              {t("Add grocery", "Adicionar item", "Añadir producto")}
            </Button>
          </fieldset>
        </form>
      )}
      {!state.loading && !state.loadError && state.items.length === 0 && (
        <p className="text-muted-foreground">
          {t(
            "No groceries yet.",
            "Nenhuma compra ainda.",
            "Aún no hay compras.",
          )}
        </p>
      )}
      <ul className="grid gap-5">
        {state.items.map((item) => (
          <li key={item.id}>
            <article className="rounded-[18px] border bg-card p-5 shadow-(--card-shadow)">
              <h3 className="mb-2 pt-2 text-[19px] font-bold leading-normal tracking-[-0.1px]">
                {item.name}
              </h3>
              <p className="text-[15px] text-muted-foreground">
                {item.checked
                  ? t("Checked", "Marcado", "Marcado")
                  : t("Needed", "Pendente", "Pendiente")}
              </p>
              {(item.quantity ||
                item.unit ||
                item.note ||
                item.assignee_id) && (
                <details className="mt-2 text-muted-foreground">
                  <summary className="cursor-pointer py-2 text-sm">
                    {t("Details", "Detalhes", "Detalles")}
                  </summary>
                  <div className="space-y-2">
                    {(item.quantity || item.unit) && (
                      <p>
                        {[item.quantity, item.unit].filter(Boolean).join(" ")}
                      </p>
                    )}
                    {item.note && (
                      <p className="whitespace-pre-wrap break-words text-muted-foreground">
                        {item.note}
                      </p>
                    )}
                    {item.assignee_id && (
                      <p className="text-sm">
                        {t("Assignee", "Responsável", "Responsable")}:{" "}
                        {props.members.find(
                          (member) => member.user_id === item.assignee_id,
                        )?.user_name ??
                          t("Former member", "Ex-membro", "Antiguo miembro")}
                      </p>
                    )}
                  </div>
                </details>
              )}
              {canWrite && (
                <div className="flex flex-wrap justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 px-4"
                    disabled={disabled}
                    onClick={() =>
                      void state.mutate(() =>
                        api(
                          `${state.path}/${encodeURIComponent(item.id)}/toggle`,
                          {
                            method: "POST",
                            body: JSON.stringify({
                              checked: !item.checked,
                              version: item.version,
                            }),
                          },
                        ),
                      )
                    }
                  >
                    {item.checked
                      ? t("Uncheck", "Desmarcar", "Desmarcar")
                      : t("Check", "Marcar", "Marcar")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-10 px-4 text-destructive hover:text-destructive"
                    disabled={disabled}
                    onClick={() => {
                      state.setError(null);
                      setDeleteId(item.id);
                    }}
                  >
                    {t("Delete", "Excluir", "Eliminar")}
                  </Button>
                </div>
              )}
            </article>
          </li>
        ))}
      </ul>
      {selected && (
        <DeleteConfirmation
          name={selected.name}
          busy={state.busy}
          disabled={disabled}
          error={state.loadError ?? state.error}
          onCancel={() => setDeleteId(null)}
          onDelete={async () => {
            if (
              await state.mutate(() =>
                api(
                  `${state.path}/${encodeURIComponent(selected.id)}?version=${selected.version}`,
                  { method: "DELETE" },
                ),
              )
            )
              setDeleteId(null);
          }}
        />
      )}
    </section>
  );
}

function ScheduleFields() {
  const { t } = usePreferences();
  return (
    <>
      <Field label={t("Timezone", "Fuso horário", "Zona horaria")}>
        {(id) => (
          <Input
            id={id}
            name="timezone"
            required
            defaultValue="UTC"
            maxLength={100}
          />
        )}
      </Field>
      <div className="grid gap-2">
        <Field
          label={t(
            "Recurrence (RRULE)",
            "Recorrência (RRULE)",
            "Recurrencia (RRULE)",
          )}
        >
          {(id) => (
            <Input
              id={id}
              name="rrule"
              required
              defaultValue={initialRule}
              maxLength={1000}
            />
          )}
        </Field>
        <p className="text-xs text-muted-foreground">
          {t(
            "DAILY, WEEKLY or MONTHLY; include COUNT (1–366) or UNTIL within one year. COUNT=1 creates a single occurrence.",
            "DAILY, WEEKLY ou MONTHLY; inclua COUNT (1–366) ou UNTIL dentro de um ano. COUNT=1 cria uma única ocorrência.",
            "DAILY, WEEKLY o MONTHLY; incluye COUNT (1–366) o UNTIL dentro de un año. COUNT=1 crea una sola ocurrencia.",
          )}
        </p>
      </div>
      <div className="grid gap-2">
        <Field
          label={t(
            "Exception dates",
            "Datas de exceção",
            "Fechas de excepción",
          )}
        >
          {(id) => (
            <Textarea id={id} name="exdates" rows={2} maxLength={2200} />
          )}
        </Field>
        <p className="text-xs text-muted-foreground">
          {t(
            "One local date and time per line, YYYY-MM-DDTHH:MM:SS (up to 100), in the timezone above. For all-day events, YYYY-MM-DD is also accepted.",
            "Uma data e hora local por linha, YYYY-MM-DDTHH:MM:SS (até 100), no fuso acima. Para eventos de dia inteiro, YYYY-MM-DD também é aceito.",
            "Una fecha y hora local por línea, YYYY-MM-DDTHH:MM:SS (hasta 100), en la zona indicada. Para eventos de todo el día, también se acepta YYYY-MM-DD.",
          )}
        </p>
      </div>
    </>
  );
}

function SchedulePanel(props: FeatureProps & { kind: "chores" | "calendar" }) {
  const { t } = usePreferences();
  const isChore = props.kind === "chores";
  const title = isChore
    ? t("Chores", "Tarefas", "Tareas")
    : t("Calendar", "Calendário", "Calendario");
  const state = useHousehold<Chore | CalendarEvent>(props, props.kind);
  const [assignee, setAssignee] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const canWrite = writable(props.role);
  const selected = state.items.find(
    (item) => item.id === deleteId && owned(props, item),
  );
  const disabled = state.busy || state.loading || state.loadError != null;
  const allDayId = useId();
  const enabledId = useId();
  function changeStart(value: string) {
    setStart(value);
    if (!isChore && (!end || end <= value)) setEnd(defaultEnd(value, allDay));
  }
  function changeAllDay(value: boolean) {
    setAllDay(value);
    const nextStart = start
      ? value
        ? start.slice(0, 10)
        : `${start.slice(0, 10)}T00:00`
      : "";
    const nextEnd = end
      ? value
        ? end.slice(0, 10)
        : `${end.slice(0, 10)}T00:00`
      : "";
    setStart(nextStart);
    setEnd(
      nextEnd && nextEnd > nextStart ? nextEnd : defaultEnd(nextStart, value),
    );
  }
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    let body;
    try {
      const title = text(data, "title");
      if (!title) throw new Error("name");
      const description = text(data, "description");
      const fields = schedule(
        text(data, "timezone"),
        text(data, "rrule"),
        text(data, "exdates"),
        allDay,
      );
      if (isChore)
        body = {
          title,
          description,
          assignee_id: assignee || null,
          timezone: fields.timezone,
          due_local: localDateTime(start),
          rrule: fields.rrule,
          exdates: fields.exdates,
          enabled,
        };
      else {
        const startLocal = localDateTime(start, allDay);
        const endLocal = localDateTime(end, allDay);
        if (endLocal <= startLocal) throw new Error("range");
        body = {
          title,
          description,
          timezone: fields.timezone,
          start_local: startLocal,
          end_local: endLocal,
          all_day: allDay,
          rrule: fields.rrule,
          exdates: fields.exdates,
        };
      }
    } catch (error) {
      state.setError(error);
      return;
    }
    if (
      await state.mutate(() =>
        api(state.path, { method: "POST", body: JSON.stringify(body) }),
      )
    ) {
      form.reset();
      setAssignee("");
      setStart("");
      setEnd("");
      setAllDay(false);
      setEnabled(true);
    }
  }
  function toggle(chore: Chore) {
    if (!owned(props, chore)) return;
    const body = {
      title: chore.title,
      description: chore.description,
      assignee_id: chore.assignee_id ?? null,
      timezone: chore.timezone,
      due_local: chore.due_local,
      rrule: chore.rrule,
      exdates: chore.exdates ?? [],
      enabled: !chore.enabled,
      version: chore.version,
    };
    void state.mutate(() =>
      api(`${state.path}/${encodeURIComponent(chore.id)}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    );
  }
  return (
    <section className="space-y-5" aria-label={title}>
      <h2 className="roomies-page-title">{title}</h2>
      <Feedback state={{ ...state, error: selected ? null : state.error }} />
      {!canWrite && <ReadOnly />}
      {canWrite && (
        <form onSubmit={create}>
          <fieldset disabled={disabled} className="grid gap-2.5">
            <Field label={t("Title", "Título", "Título")}>
              {(id) => <Input id={id} name="title" required maxLength={160} />}
            </Field>
            <Field
              label={
                isChore
                  ? t("Due local", "Vencimento local", "Vencimiento local")
                  : t("Start local", "Início local", "Inicio local")
              }
            >
              {(id) => (
                <Input
                  id={id}
                  type={allDay ? "date" : "datetime-local"}
                  step={allDay ? undefined : 1}
                  required
                  value={start}
                  onChange={(e) => changeStart(e.target.value)}
                />
              )}
            </Field>
            {!isChore && (
              <Field label={t("End local", "Fim local", "Fin local")}>
                {(id) => (
                  <Input
                    id={id}
                    type={allDay ? "date" : "datetime-local"}
                    step={allDay ? undefined : 1}
                    required
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                )}
              </Field>
            )}
            {!isChore && allDay && (
              <p className="text-xs text-muted-foreground">
                {t(
                  "End is exclusive: a one-day event ends on the following date.",
                  "O fim é exclusivo: um evento de um dia termina na data seguinte.",
                  "El final es exclusivo: un evento de un día termina en la fecha siguiente.",
                )}
              </p>
            )}
            <details>
              <summary className="cursor-pointer py-2 font-semibold text-primary">
                {t("More options", "Mais opções", "Más opciones")}
              </summary>
              <div className="grid gap-2.5 pt-2">
                {isChore ? (
                  <Assignee
                    members={props.members}
                    value={assignee}
                    onChange={setAssignee}
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={allDayId}
                      checked={allDay}
                      onCheckedChange={(checked) =>
                        changeAllDay(checked === true)
                      }
                    />
                    <Label htmlFor={allDayId}>
                      {t("All day", "Dia inteiro", "Todo el día")}
                    </Label>
                  </div>
                )}
                <div>
                  <Field label={t("Description", "Descrição", "Descripción")}>
                    {(id) => (
                      <Textarea
                        id={id}
                        name="description"
                        rows={2}
                        maxLength={4000}
                      />
                    )}
                  </Field>
                </div>
                <ScheduleFields />
                {isChore && (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={enabledId}
                      checked={enabled}
                      onCheckedChange={(checked) =>
                        setEnabled(checked === true)
                      }
                    />
                    <Label htmlFor={enabledId}>
                      {t("Enabled", "Ativa", "Activa")}
                    </Label>
                  </div>
                )}
              </div>
            </details>
            <Button type="submit" className="my-2 h-12 w-full">
              {isChore
                ? t("Create chore", "Criar tarefa", "Crear tarea")
                : t("Create calendar event", "Criar evento", "Crear evento")}
            </Button>
          </fieldset>
        </form>
      )}
      {!state.loading && !state.loadError && state.items.length === 0 && (
        <p className="text-muted-foreground">
          {isChore
            ? t(
                "No chores yet.",
                "Ainda não há tarefas.",
                "Todavía no hay tareas.",
              )
            : t(
                "No events yet.",
                "Ainda não há eventos.",
                "Todavía no hay eventos.",
              )}
        </p>
      )}
      <ul className="grid gap-5">
        {state.items.map((item) => (
          <li key={item.id}>
            <article className="rounded-[18px] border bg-card p-5 shadow-(--card-shadow)">
              <h3 className="mb-2 pt-2 text-[19px] font-bold leading-normal tracking-[-0.1px]">
                {item.title}
              </h3>
              <details className="text-muted-foreground">
                <summary className="cursor-pointer py-2 text-sm">
                  {t("Details", "Detalhes", "Detalles")}
                </summary>
                <div className="space-y-2">
                  {item.description && (
                    <p className="whitespace-pre-wrap break-words text-muted-foreground">
                      {item.description}
                    </p>
                  )}
                  {"due_local" in item ? (
                    <>
                      <p>
                        <time dateTime={item.due_local}>
                          {item.due_local.replace("T", " ")}
                        </time>{" "}
                        · {item.timezone}
                      </p>
                      <p>
                        {item.enabled
                          ? t("Enabled", "Ativa", "Activa")
                          : t("Disabled", "Desativada", "Desactivada")}
                      </p>
                      {item.assignee_id && (
                        <p className="text-sm">
                          {t("Assignee", "Responsável", "Responsable")}:{" "}
                          {props.members.find(
                            (member) => member.user_id === item.assignee_id,
                          )?.user_name ??
                            t("Former member", "Ex-membro", "Antiguo miembro")}
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <p>
                        <time dateTime={item.start_local}>
                          {item.all_day
                            ? item.start_local.slice(0, 10)
                            : item.start_local.replace("T", " ")}
                        </time>{" "}
                        –{" "}
                        <time dateTime={item.end_local}>
                          {item.all_day
                            ? item.end_local.slice(0, 10)
                            : item.end_local.replace("T", " ")}
                        </time>{" "}
                        · {item.timezone}
                      </p>
                      {item.all_day && (
                        <p className="text-sm">
                          {t(
                            "All day (end date excluded)",
                            "Dia inteiro (data final excluída)",
                            "Todo el día (fecha final excluida)",
                          )}
                        </p>
                      )}
                    </>
                  )}
                  <p className="break-all text-sm text-muted-foreground">
                    {t("Recurrence", "Recorrência", "Recurrencia")}:{" "}
                    {item.rrule}
                  </p>
                  {item.exdates?.length > 0 && (
                    <p className="break-words text-sm text-muted-foreground">
                      {t(
                        "Exception dates",
                        "Datas de exceção",
                        "Fechas de excepción",
                      )}
                      : {item.exdates.join(", ")}
                    </p>
                  )}
                </div>
              </details>
              {owned(props, item) && (
                <div className="flex flex-wrap justify-end gap-2 pt-2">
                  {"due_local" in item && (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 px-4"
                      disabled={disabled}
                      onClick={() => toggle(item)}
                    >
                      {item.enabled
                        ? t("Disable", "Desativar", "Desactivar")
                        : t("Enable", "Ativar", "Activar")}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-10 px-4 text-destructive hover:text-destructive"
                    disabled={disabled}
                    onClick={() => {
                      state.setError(null);
                      setDeleteId(item.id);
                    }}
                  >
                    {t("Delete", "Excluir", "Eliminar")}
                  </Button>
                </div>
              )}
            </article>
          </li>
        ))}
      </ul>
      {selected && (
        <DeleteConfirmation
          name={selected.title}
          busy={state.busy}
          disabled={disabled}
          error={state.loadError ?? state.error}
          onCancel={() => setDeleteId(null)}
          onDelete={async () => {
            if (
              owned(props, selected) &&
              (await state.mutate(() =>
                api(
                  `${state.path}/${encodeURIComponent(selected.id)}?version=${selected.version}`,
                  { method: "DELETE" },
                ),
              ))
            )
              setDeleteId(null);
          }}
        />
      )}
    </section>
  );
}
