export function localDateTime(value: string, dateOnly = false): string {
  let local = value.trim();
  if (dateOnly && /^\d{4}-\d{2}-\d{2}$/.test(local)) local += "T00:00:00";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) local += ":00";
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(local))
    throw new Error("date");
  // UTC is used only to check calendar fields; the API receives the original wall-clock time.
  const check = new Date(`${local}Z`);
  if (
    !Number.isFinite(check.getTime()) ||
    check.toISOString().slice(0, 19) !== local
  )
    throw new Error("date");
  return local;
}

export function defaultEnd(value: string, allDay: boolean): string {
  try {
    const date = new Date(`${localDateTime(value, allDay)}Z`);
    date.setTime(date.getTime() + (allDay ? 24 : 1) * 60 * 60 * 1000);
    return date
      .toISOString()
      .slice(0, allDay ? 10 : value.length === 19 ? 19 : 16);
  } catch {
    return "";
  }
}

export function schedule(
  timezone: string,
  rule: string,
  exceptions: string,
  allDay = false,
) {
  timezone = timezone.trim();
  try {
    if (!timezone || /^[+-]/.test(timezone)) throw new Error("timezone");
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
  } catch {
    throw new Error("timezone");
  }
  const rrule = rule
    .trim()
    .toUpperCase()
    .replace(/^RRULE:/, "");
  const parts = new Map<string, string>();
  const allowed = [
    "FREQ",
    "INTERVAL",
    "COUNT",
    "UNTIL",
    "BYDAY",
    "BYMONTHDAY",
    "BYMONTH",
    "WKST",
  ];
  for (const part of rrule.split(";")) {
    const [key, value, extra] = part.split("=");
    if (!allowed.includes(key) || !value || extra !== undefined)
      throw new Error("recurrence");
    parts.set(key, value);
  }
  if (
    !["DAILY", "WEEKLY", "MONTHLY"].includes(parts.get("FREQ") ?? "") ||
    (!parts.has("COUNT") && !parts.has("UNTIL"))
  )
    throw new Error("recurrence");
  for (const key of ["COUNT", "INTERVAL"]) {
    const value = parts.get(key);
    if (
      value !== undefined &&
      (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 366)
    )
      throw new Error("recurrence");
  }
  // The server validates the remaining RFC 5545 fields and UNTIL horizon against its clock.
  const lines = exceptions
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
  if (lines.length > 100) throw new Error("exceptions");
  return {
    timezone,
    rrule,
    exdates: lines.map((value) => localDateTime(value, allDay)),
  };
}
