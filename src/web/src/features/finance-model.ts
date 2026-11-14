import type { Member } from "@/lib/api";

export interface ExpenseDraft {
  amount: string;
  description: string;
  category: string;
  date: string;
  visibility: "shared" | "private";
  recipients: string[];
  splitMode: "equal" | "custom" | "keep";
  shares: Record<string, string>;
}
export type ExpenseValidation =
  | "amount"
  | "description"
  | "date"
  | "recipients"
  | "splitPositive"
  | "splitTotal"
  | "splitMember"
  | "replacement";
interface ExpenseBody {
  amount: number;
  description: string;
  category: string;
  date: string;
  split?: { user_id: string; amount: number }[];
  visibility?: string;
  visible_to?: string[];
}

export function parseMoneyCents(value: string): number | null {
  let text = value.trim();
  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(text))
    text = text.replaceAll(".", "").replace(",", ".");
  else if (/^\d+,\d{1,2}$/.test(text)) text = text.replace(",", ".");
  if (!/^\d+(\.\d{0,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= 9_999_999_999 ? cents : null;
}
export const canCreate = (role: string | null) =>
  role === "admin" || role === "member";
export const canMutate = (role: string | null, owner: boolean) =>
  canCreate(role) && (owner || role === "admin");
export const canChangeVisibility = (role: string | null, owner: boolean) =>
  canCreate(role) && owner;
export const validRecipients = (ids: string[], members: Member[]) =>
  new Set(ids).size === ids.length &&
  ids.every((id) => members.some((member) => member.user_id === id));

export function expenseBody(
  draft: ExpenseDraft,
  members: Member[],
  editing = false,
): { ok: true; value: ExpenseBody } | { ok: false; error: ExpenseValidation } {
  const cents = parseMoneyCents(draft.amount);
  if (cents === null || cents <= 0) return { ok: false, error: "amount" };
  if (!draft.description.trim()) return { ok: false, error: "description" };
  const date = new Date(`${draft.date}T12:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(draft.date) ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== draft.date
  )
    return { ok: false, error: "date" };
  const body: ExpenseBody = {
    amount: cents / 100,
    description: draft.description.trim(),
    category: draft.category.trim(),
    date: draft.date,
  };
  const eligible = members.filter((member) => member.role !== "monitor");
  if (draft.splitMode === "custom") {
    const entries = Object.entries(draft.shares).filter(
      ([, value]) => value.trim() !== "",
    );
    const split: { user_id: string; amount: number }[] = [];
    let total = 0;
    for (const [userId, value] of entries) {
      if (!eligible.some((member) => member.user_id === userId))
        return { ok: false, error: "splitMember" };
      const share = parseMoneyCents(value);
      if (share === null || share <= 0)
        return { ok: false, error: "splitPositive" };
      total += share;
      split.push({ user_id: userId, amount: share / 100 });
    }
    if (!split.length || total !== cents)
      return { ok: false, error: "splitTotal" };
    body.split = split;
  } else if (draft.splitMode === "equal") {
    if (!eligible.length) return { ok: false, error: "splitMember" };
    if (editing) {
      const base = Math.floor(cents / eligible.length);
      if (!base) return { ok: false, error: "splitPositive" };
      body.split = eligible.map((member, i) => ({
        user_id: member.user_id,
        amount: (base + (i < cents % eligible.length ? 1 : 0)) / 100,
      }));
    } else body.split = [];
  }
  if (!editing) {
    if (
      draft.visibility === "private" &&
      !validRecipients(draft.recipients, members)
    )
      return { ok: false, error: "recipients" };
    body.visibility = draft.visibility;
    body.visible_to = draft.visibility === "private" ? draft.recipients : [];
  }
  return { ok: true, value: body };
}

export function financeDate(value: string, locale: string, withTime = false) {
  const date = new Date(withTime ? value : `${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return withTime
    ? date.toLocaleString(locale === "pt" ? "pt-BR" : locale)
    : date.toLocaleDateString(locale === "pt" ? "pt-BR" : locale);
}
