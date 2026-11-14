import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { currencies } from "./currencies";
export interface Preferences {
  language: "system" | "en" | "pt" | "es";
  theme: "system" | "light" | "dark";
  accent: "mint" | "plum";
  currency: string;
  defaultHouse: string;
}
const defaults: Preferences = {
  language: "system",
  theme: "system",
  accent: "mint",
  currency: "auto",
  defaultHouse: "",
};
function read(): Preferences {
  try {
    const value = JSON.parse(
      localStorage.getItem("roomies.web.preferences") ?? "{}",
    );
    return {
      language: ["system", "en", "pt", "es"].includes(value.language)
        ? value.language
        : "system",
      theme: ["system", "light", "dark"].includes(value.theme)
        ? value.theme
        : "system",
      accent: value.accent === "plum" ? "plum" : "mint",
      currency: currencies.includes(value.currency) ? value.currency : "auto",
      defaultHouse:
        typeof value.defaultHouse === "string" ? value.defaultHouse : "",
    };
  } catch {
    return defaults;
  }
}
function deviceLanguage() {
  for (const tag of navigator.languages ?? [navigator.language]) {
    const code = tag.toLowerCase().split(/[-_]/)[0];
    if (code === "en" || code === "pt" || code === "es") return code;
  }
  return "en";
}
function useValue() {
  const [preferences, setPreferences] = useState(read);
  const [deviceLocale, setDeviceLocale] = useState(deviceLanguage);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false,
  );
  const locale =
    preferences.language === "system" ? deviceLocale : preferences.language;
  const currency =
    preferences.currency === "auto"
      ? locale === "pt"
        ? "BRL"
        : "USD"
      : preferences.currency;
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const change = () => setSystemDark(media?.matches ?? false);
    const language = () => setDeviceLocale(deviceLanguage());
    media?.addEventListener("change", change);
    window.addEventListener("languagechange", language);
    return () => {
      media?.removeEventListener("change", change);
      window.removeEventListener("languagechange", language);
    };
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(
        "roomies.web.preferences",
        JSON.stringify(preferences),
      );
    } catch {
      /* Preferences still work when storage is unavailable. */
    }
    document.documentElement.lang = locale;
    document.documentElement.classList.toggle(
      "dark",
      preferences.theme === "dark" ||
        (preferences.theme === "system" && systemDark),
    );
    document.documentElement.dataset.accent = preferences.accent;
  }, [preferences, locale, systemDark]);
  return {
    preferences,
    locale,
    currency,
    setPreference: <K extends keyof Preferences>(
      key: K,
      value: Preferences[K],
    ) => setPreferences((current) => ({ ...current, [key]: value })),
    t: (en: string, pt = en, es = en) =>
      locale === "pt" ? pt : locale === "es" ? es : en,
    money: (amount: number) =>
      new Intl.NumberFormat(locale === "pt" ? "pt-BR" : locale, {
        style: "currency",
        currency,
      }).format(amount),
  };
}
const Context = createContext<ReturnType<typeof useValue> | null>(null);
export function PreferencesProvider({ children }: { children: ReactNode }) {
  return <Context.Provider value={useValue()}>{children}</Context.Provider>;
}
export function usePreferences() {
  const context = useContext(Context);
  if (!context) throw new Error("PreferencesProvider is required");
  return context;
}
