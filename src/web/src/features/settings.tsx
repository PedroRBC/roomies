import { useState } from "react";
import { Circle, CircleDot, Pencil } from "lucide-react";
import type { SubmitEvent } from "react";
import { api, ApiError } from "@/lib/api";
import type { House, User } from "@/lib/api";
import { usePreferences } from "@/lib/preferences";
import { currencies } from "@/lib/currencies";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Choice } from "@/components/choice";
import { Field } from "@/components/field";
export function Settings({
  user,
  houses,
  onRefresh,
  onUnauthorized,
}: {
  user: User | null;
  houses: House[];
  onRefresh: () => void;
  onUnauthorized: () => void;
}) {
  const { t, locale, preferences: prefs, setPreference } = usePreferences();
  const [editing, setEditing] = useState<House | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function rename(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const name = String(new FormData(event.currentTarget).get("name")).trim();
    if (!name) return;
    setBusy(true);
    setError("");
    try {
      await api(`/houses/${encodeURIComponent(editing.id)}`, {
        method: "PUT",
        body: JSON.stringify({ name }),
      });
      onRefresh();
      setEditing(null);
    } catch (err) {
      setError((err as Error).message);
      if ((err as ApiError).status === 401) onUnauthorized();
    } finally {
      setBusy(false);
    }
  }
  const system = t("Device", "Dispositivo", "Dispositivo");
  return (
    <section className="mx-auto w-full max-w-[520px]">
      <h1 className="roomies-page-title mb-5">
        {t("Settings", "Configurações", "Configuración")}
      </h1>
      {user && (
        <Card className="mb-7 flex-row items-center gap-3.5 rounded-2xl p-4">
          <span
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary font-bold text-secondary-foreground"
            aria-hidden="true"
          >
            {Array.from(user.name.trim())[0]?.toUpperCase() ?? "?"}
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold">{user.name}</p>
            <p className="truncate text-[15px] text-muted-foreground">
              {user.email}
            </p>
          </div>
        </Card>
      )}
      <div className="mb-7" role="group" aria-labelledby="settings-language">
        <h2
          id="settings-language"
          className="mb-3 text-[19px] font-bold tracking-[-0.1px]"
        >
          {t("Language", "Idioma", "Idioma")}
        </h2>
        {[
          { value: "system", label: system },
          { value: "en", label: "English" },
          { value: "pt", label: "Português" },
          { value: "es", label: "Español" },
        ].map((item) => (
          <Button
            key={item.value}
            variant="ghost"
            aria-pressed={prefs.language === item.value}
            className={`h-14 w-full justify-start gap-3 rounded-xl px-3 text-base ${prefs.language === item.value ? "bg-secondary font-bold text-secondary-foreground" : "font-medium"}`}
            onClick={() =>
              setPreference("language", item.value as typeof prefs.language)
            }
          >
            {prefs.language === item.value ? (
              <CircleDot className="size-[22px]" aria-hidden="true" />
            ) : (
              <Circle
                className="size-[22px] text-muted-foreground"
                aria-hidden="true"
              />
            )}
            {item.label}
            {item.value === "system" && prefs.language === "system" && (
              <span className="ml-auto text-[15px] font-normal">
                {locale === "pt"
                  ? "Português"
                  : locale === "es"
                    ? "Español"
                    : "English"}
              </span>
            )}
          </Button>
        ))}
      </div>
      <div className="mb-7 [&_label]:mb-1 [&_label]:text-[19px] [&_label]:font-bold">
        <Choice
          label={t("Currency", "Moeda", "Moneda")}
          value={prefs.currency}
          onChange={(value) => setPreference("currency", value)}
          choices={[
            {
              value: "auto",
              label: `${t("Follow language", "Seguir idioma", "Seguir idioma")} — ${locale === "pt" ? "BRL" : "USD"}`,
            },
            ...currencies.map((value) => ({
              value,
              label: `${value} · ${new Intl.NumberFormat(locale, { style: "currency", currency: value }).format(9.5)}`,
            })),
          ]}
        />
      </div>
      <div className="mb-7" role="group" aria-labelledby="settings-appearance">
        <h2
          id="settings-appearance"
          className="mb-3 text-[19px] font-bold tracking-[-0.1px]"
        >
          {t("Appearance", "Aparência", "Apariencia")}
        </h2>
        <div className="flex rounded-[14px] bg-muted p-1">
          {[
            { value: "system", label: system },
            { value: "light", label: t("Light", "Claro", "Claro") },
            { value: "dark", label: t("Dark", "Escuro", "Oscuro") },
          ].map((item) => (
            <Button
              key={item.value}
              variant="ghost"
              aria-pressed={prefs.theme === item.value}
              className={`h-11 min-w-0 flex-1 rounded-[10px] px-2 ${prefs.theme === item.value ? "bg-card font-bold" : "font-medium text-muted-foreground"}`}
              onClick={() =>
                setPreference("theme", item.value as typeof prefs.theme)
              }
            >
              {item.label}
            </Button>
          ))}
        </div>
      </div>
      <div className="mb-7" role="group" aria-labelledby="settings-accent">
        <h2
          id="settings-accent"
          className="mb-3 text-[19px] font-bold tracking-[-0.1px]"
        >
          {t("Accent color", "Cor de destaque", "Color de acento")}
        </h2>
        <div className="flex flex-wrap gap-2.5">
          {[
            {
              value: "mint",
              label: t("Mint", "Verde-água", "Menta"),
              color: "bg-[#0F7F5C] dark:bg-[#21C68F]",
            },
            {
              value: "plum",
              label: t("Plum", "Ameixa", "Ciruela"),
              color: "bg-[#53134B] dark:bg-[#D38AC7]",
            },
          ].map((item) => (
            <Button
              key={item.value}
              variant="outline"
              aria-pressed={prefs.accent === item.value}
              className={`h-11 gap-2.5 rounded-xl pr-4 pl-3 ${prefs.accent === item.value ? "border-2 border-primary bg-card font-bold" : "bg-transparent font-medium"}`}
              onClick={() =>
                setPreference("accent", item.value as typeof prefs.accent)
              }
            >
              <span
                className={`size-[22px] rounded-full ${item.color}`}
                aria-hidden="true"
              />
              {item.label}
            </Button>
          ))}
        </div>
      </div>
      {user && (
        <div className="mb-7" role="group" aria-labelledby="settings-houses">
          <h2
            id="settings-houses"
            className="text-[19px] font-bold tracking-[-0.1px]"
          >
            {t("Your houses", "Suas casas", "Tus casas")}
          </h2>
          <p className="mt-0.5 mb-3 text-[15px] text-muted-foreground">
            {t(
              "Open your default house when restoring a session.",
              "Abra sua casa padrão ao restaurar uma sessão.",
              "Abre tu casa predeterminada al restaurar una sesión.",
            )}
          </p>
          {[
            {
              id: "",
              name: t(
                "No default house",
                "Nenhuma casa padrão",
                "Sin casa predeterminada",
              ),
            },
            ...houses,
          ].map((house) => {
            const selected =
              house.id ===
              (houses.some((item) => item.id === prefs.defaultHouse)
                ? prefs.defaultHouse
                : "");
            return (
              <div
                key={house.id}
                className={`flex items-center rounded-xl ${selected ? "bg-secondary text-secondary-foreground" : ""}`}
              >
                <Button
                  variant="ghost"
                  aria-pressed={selected}
                  className={`h-14 min-w-0 flex-1 justify-start gap-3 px-3 text-base ${selected ? "font-bold" : "font-medium"}`}
                  onClick={() => setPreference("defaultHouse", house.id)}
                >
                  {selected ? (
                    <CircleDot className="size-[22px]" aria-hidden="true" />
                  ) : (
                    <Circle
                      className="size-[22px] text-muted-foreground"
                      aria-hidden="true"
                    />
                  )}
                  <span className="truncate">{house.name}</span>
                </Button>
                {house.id && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="mr-1"
                    aria-label={`${t("Rename house", "Renomear casa", "Renombrar casa")}: ${house.name}`}
                    onClick={() => {
                      setError("");
                      setEditing(house);
                    }}
                  >
                    <Pencil className="size-5" aria-hidden="true" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("Rename house", "Renomear casa", "Renombrar casa")}
            </DialogTitle>
            <DialogDescription>
              {t(
                "Only house administrators can rename a house.",
                "Somente administradores podem renomear uma casa.",
                "Solo los administradores pueden renombrar una casa.",
              )}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <form key={editing?.id} onSubmit={rename} className="grid gap-4">
            <Field
              label={t("House name", "Nome da casa", "Nombre de la casa")}
              name="name"
              required
              maxLength={100}
              defaultValue={editing?.name}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setEditing(null)}
              >
                {t("Cancel", "Cancelar", "Cancelar")}
              </Button>
              <Button disabled={busy} type="submit">
                {t("Save changes", "Salvar alterações", "Guardar cambios")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
