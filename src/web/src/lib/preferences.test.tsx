import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { PreferencesProvider, usePreferences } from "./preferences";
afterEach(() => {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset.accent;
  document.documentElement.classList.remove("dark");
});
it("persists language, currency, appearance and accent and restores them", () => {
  const first = renderHook(usePreferences, { wrapper: PreferencesProvider });
  act(() => {
    first.result.current.setPreference("language", "pt");
    first.result.current.setPreference("theme", "dark");
    first.result.current.setPreference("accent", "plum");
  });
  expect(first.result.current.currency).toBe("BRL");
  expect(first.result.current.t("Save", "Salvar", "Guardar")).toBe("Salvar");
  expect(document.documentElement.lang).toBe("pt");
  expect(document.documentElement).toHaveClass("dark");
  expect(document.documentElement.dataset.accent).toBe("plum");
  act(() => first.result.current.setPreference("currency", "EUR"));
  first.unmount();
  const restored = renderHook(usePreferences, { wrapper: PreferencesProvider });
  expect(restored.result.current.currency).toBe("EUR");
  expect(restored.result.current.money(12.34)).toContain("12,34");
});
it("rejects invalid stored values and falls back to supported settings", () => {
  localStorage.setItem(
    "roomies.web.preferences",
    JSON.stringify({
      language: "unknown",
      theme: "wrong",
      currency: "NaN",
      accent: "invalid",
      defaultHouse: 123,
    }),
  );
  const view = renderHook(usePreferences, { wrapper: PreferencesProvider });
  expect(view.result.current.preferences).toEqual({
    language: "system",
    theme: "system",
    currency: "auto",
    accent: "mint",
    defaultHouse: "",
  });
});
