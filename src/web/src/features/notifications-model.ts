export interface NotificationPreferences {
  house_id?: string;
  user_id?: string;
  expense_created_enabled: boolean;
  reminder_enabled: boolean;
  cadence: string;
  timezone: string;
  quiet_start_minutes?: number | null;
  quiet_end_minutes?: number | null;
  digest_minutes: number;
}
export interface NotificationSubscription {
  id: string;
  house_id: string;
  user_id: string;
  platform: string;
  device_label: string;
  created_at: string;
  last_seen_at: string;
  revoked_at?: string | null;
}
export interface EventRequest {
  title: string;
  timezone: string;
  dtstart_local: string;
  rrule: string;
  exdates: string[];
  enabled: boolean;
}
export interface ScheduledEvent extends EventRequest {
  id: string;
  house_id: string;
  creator_id: string;
  next_occurrence_at?: string | null;
  created_at: string;
  updated_at: string;
}
export interface EventDraft {
  title: string;
  start: string;
  timezone: string;
  frequency: string;
  interval: string;
  count: string;
  until: string;
  exdates: string;
  extras: string;
  enabled: boolean;
}
export const emptyEvent: EventDraft = {
  title: "",
  start: "",
  timezone: "UTC",
  frequency: "DAILY",
  interval: "1",
  count: "1",
  until: "",
  exdates: "",
  extras: "",
  enabled: true,
};
export function minutesTime(value?: number | null) {
  return value == null
    ? ""
    : `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
export function timeMinutes(value: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}
function validZone(zone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone }).format();
    return !!zone.trim();
  } catch {
    return false;
  }
}
export function validatePreferences(value: NotificationPreferences) {
  if (!validZone(value.timezone.trim())) throw new Error("timezone");
  if (!["immediate", "daily_digest"].includes(value.cadence))
    throw new Error("cadence");
  const validMinutes = (n: number) => Number.isInteger(n) && n >= 0 && n < 1440;
  if ((value.quiet_start_minutes == null) !== (value.quiet_end_minutes == null))
    throw new Error("quiet");
  if (
    value.quiet_start_minutes != null &&
    (!validMinutes(value.quiet_start_minutes) ||
      !validMinutes(value.quiet_end_minutes!))
  )
    throw new Error("quiet");
  if (!validMinutes(value.digest_minutes)) throw new Error("time");
}
function localDate(value: string) {
  const normalized = value.length === 16 ? `${value}:00` : value;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(normalized))
    throw new Error("date");
  const parsed = new Date(`${normalized}Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 19) !== normalized
  )
    throw new Error("date");
  return normalized;
}
export function eventDraft(event: EventRequest): EventDraft {
  const parts = event.rrule
    .trim()
    .toUpperCase()
    .replace(/^RRULE:/, "")
    .split(";");
  const field = (name: string) =>
    parts.find((p) => p.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
  return {
    title: event.title,
    start: event.dtstart_local,
    timezone: event.timezone,
    frequency: field("FREQ") || "DAILY",
    interval: field("INTERVAL") || "1",
    count: field("COUNT"),
    until: field("UNTIL"),
    exdates: (event.exdates ?? []).join(", "),
    extras: parts
      .filter((p) => !/^(FREQ|INTERVAL|COUNT|UNTIL)=/.test(p))
      .join(";"),
    enabled: event.enabled,
  };
}
export function buildEventRequest(draft: EventDraft): EventRequest {
  const title = draft.title.trim();
  if (!title || new TextEncoder().encode(title).length > 120)
    throw new Error("title");
  const timezone = draft.timezone.trim();
  if (!validZone(timezone)) throw new Error("timezone");
  const start = localDate(draft.start);
  if (!["DAILY", "WEEKLY", "MONTHLY"].includes(draft.frequency))
    throw new Error("recurrence");
  const bounded = (value: string) =>
    /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 366;
  if (!bounded(draft.interval)) throw new Error("interval");
  let rrule = `FREQ=${draft.frequency};INTERVAL=${Number(draft.interval)}`;
  if (draft.count.trim()) {
    if (!bounded(draft.count.trim())) throw new Error("count");
    rrule += `;COUNT=${Number(draft.count)}`;
  }
  if (draft.until.trim()) {
    let until = draft.until.trim();
    if (until.includes("-")) until = localDate(until).replace(/[-:]/g, "");
    if (!/^\d{8}(T\d{6}Z?)?$/.test(until)) throw new Error("until");
    const datePart = `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}`;
    const time = until.includes("T")
      ? `${until.slice(9, 11)}:${until.slice(11, 13)}:${until.slice(13, 15)}`
      : "00:00:00";
    const untilLocal = localDate(`${datePart}T${time}`);
    if ((!until.endsWith("Z") || timezone === "UTC") && untilLocal <= start)
      throw new Error("until");
    // The server validates the one-year bound and UTC UNTIL against the event zone.
    rrule += `;UNTIL=${until}`;
  } else if (!draft.count.trim()) throw new Error("bounded");
  if (draft.extras.trim()) {
    if (
      !draft.extras
        .split(";")
        .every((p) => /^(BYDAY|BYMONTHDAY|BYMONTH|WKST)=[A-Z0-9,+-]+$/.test(p))
    )
      throw new Error("recurrence");
    rrule += `;${draft.extras}`;
  }
  const exdates = draft.exdates
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(localDate);
  if (exdates.length > 100) throw new Error("exceptions");
  return {
    title,
    timezone,
    dtstart_local: start,
    rrule,
    exdates,
    enabled: draft.enabled,
  };
}
