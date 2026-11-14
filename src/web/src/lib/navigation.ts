import { useCallback, useEffect, useState } from "react";
export const houseTabs = [
  "expenses",
  "notes",
  "groceries",
  "chores",
  "calendar",
  "balances",
  "notifications",
  "members",
] as const;
export type HouseTab = (typeof houseTabs)[number];
export function readRoute() {
  const url = new URL(window.location.href);
  const match = /^\/house\/([^/]+)\/?$/.exec(url.pathname);
  let houseId = "";
  try {
    houseId = match ? decodeURIComponent(match[1]) : "";
  } catch {
    /* Invalid route remains a not-found page. */
  }
  const candidate = (url.searchParams.get("tab") ?? "").trim().toLowerCase();
  return {
    path: url.pathname,
    create: url.searchParams.get("create") === "1",
    houseId,
    tab: houseTabs.includes(candidate as HouseTab)
      ? (candidate as HouseTab)
      : ("expenses" as HouseTab),
  };
}
export function useRoute() {
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    const update = () => setRoute(readRoute());
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  const navigate = useCallback((path: string, replace = false) => {
    if (!path.startsWith("/") || path.startsWith("//"))
      throw new Error("Expected an app route");
    window.history[replace ? "replaceState" : "pushState"](null, "", path);
    setRoute(readRoute());
  }, []);
  return { ...route, navigate };
}
export const houseLink = (id: string, tab?: HouseTab) =>
  `/house/${encodeURIComponent(id)}${tab ? `?tab=${tab}` : ""}`;
