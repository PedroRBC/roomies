export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-Roomies-Client": "web",
      },
    });
  } catch {
    throw new ApiError(
      0,
      "Unable to reach Roomies. Check your connection and try again.",
    );
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      typeof body?.error === "string"
        ? body.error
        : `Request failed (${response.status}). Try again.`,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

export function workosUrl(value: string, action: "authorize" | "logout") {
  const url = new URL(value);
  const path =
    action === "authorize"
      ? "/user_management/authorize"
      : "/user_management/sessions/logout";
  if (
    url.protocol !== "https:" ||
    url.hostname !== "api.workos.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.pathname !== path
  ) {
    throw new Error("The sign-in service returned an invalid redirect URL.");
  }
  return url.href;
}

export interface User {
  id: string;
  name: string;
  email: string;
}
export interface House {
  id: string;
  name: string;
}
export interface Member {
  user_id: string;
  user_name: string;
  role: string;
}
export interface Expense {
  id: string;
  description: string;
  amount: number;
  date: string;
  payer_name: string;
  category: string;
}
export interface Note {
  id: string;
  title: string;
  content: string;
  author_name: string;
}
export interface Balances {
  balances: {
    user_id: string;
    user_name: string;
    paid: number;
    owed: number;
    net: number;
  }[];
  settlements: {
    from_user_id: string;
    from_user_name: string;
    to_user_id: string;
    to_user_name: string;
    amount: number;
  }[];
}
export interface HouseData {
  expenses: Expense[];
  notes: Note[];
  members: Member[];
  balances: Balances;
}

export const money = (amount: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    amount,
  );
