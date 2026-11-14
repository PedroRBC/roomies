import { useState } from "react";
import type { SubmitEvent } from "react";
import { api, ApiError } from "@/lib/api";
import type { House, User } from "@/lib/api";
import { usePreferences } from "@/lib/preferences";
import { currencies } from "@/lib/currencies";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
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
  const { t, preferences: prefs, setPreference } = usePreferences();
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
  const system = t("Follow device", "Seguir dispositivo", "Seguir dispositivo");
  return (
    <section className="mx-auto grid max-w-xl gap-6">
      <h1 className="text-3xl font-semibold">
        {t("Settings", "Configurações", "Ajustes")}
      </h1>
      {user && (
        <Card>
          <CardHeader>
            <CardTitle>{user.name}</CardTitle>
            <CardDescription>{user.email}</CardDescription>
          </CardHeader>
        </Card>
      )}
      <Card>
        <CardContent className="grid gap-5 pt-6">
          <Choice
            label={t("Language", "Idioma", "Idioma")}
            value={prefs.language}
            onChange={(value) =>
              setPreference("language", value as typeof prefs.language)
            }
            choices={[
              { value: "system", label: system },
              { value: "en", label: "English" },
              { value: "pt", label: "Português (Brasil)" },
              { value: "es", label: "Español" },
            ]}
          />
          <Choice
            label={t("Currency", "Moeda", "Moneda")}
            value={prefs.currency}
            onChange={(value) => setPreference("currency", value)}
            choices={[
              {
                value: "auto",
                label: t("Follow language", "Seguir idioma", "Seguir idioma"),
              },
              ...currencies.map((value) => ({ value, label: value })),
            ]}
          />
          <Choice
            label={t("Appearance", "Aparência", "Apariencia")}
            value={prefs.theme}
            onChange={(value) =>
              setPreference("theme", value as typeof prefs.theme)
            }
            choices={[
              { value: "system", label: system },
              { value: "light", label: t("Light", "Claro", "Claro") },
              { value: "dark", label: t("Dark", "Escuro", "Oscuro") },
            ]}
          />
          <Choice
            label={t("Brand accent", "Cor da marca", "Color de marca")}
            value={prefs.accent}
            onChange={(value) =>
              setPreference("accent", value as typeof prefs.accent)
            }
            choices={[
              { value: "mint", label: t("Mint", "Menta", "Menta") },
              { value: "plum", label: t("Plum", "Ameixa", "Ciruela") },
            ]}
          />
        </CardContent>
      </Card>
      {user && (
        <Card>
          <CardHeader>
            <CardTitle>{t("Your houses", "Suas casas", "Tus casas")}</CardTitle>
            <CardDescription>
              {t(
                "Open your default house when restoring a session.",
                "Abra sua casa padrão ao restaurar uma sessão.",
                "Abre tu casa predeterminada al restaurar una sesión.",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Choice
              label={t("Default house", "Casa padrão", "Casa predeterminada")}
              value={
                houses.some((house) => house.id === prefs.defaultHouse)
                  ? prefs.defaultHouse
                  : "none"
              }
              onChange={(value) =>
                setPreference("defaultHouse", value === "none" ? "" : value)
              }
              choices={[
                {
                  value: "none",
                  label: t(
                    "No default house",
                    "Nenhuma casa padrão",
                    "Sin casa predeterminada",
                  ),
                },
                ...houses.map((house) => ({
                  value: house.id,
                  label: house.name,
                })),
              ]}
            />
            <ul className="divide-y">
              {houses.map((house) => (
                <li
                  key={house.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <span>{house.name}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setError("");
                      setEditing(house);
                    }}
                  >
                    {t("Rename", "Renomear", "Renombrar")}
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
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
            <Button disabled={busy} type="submit">
              {t("Save changes", "Salvar alterações", "Guardar cambios")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
