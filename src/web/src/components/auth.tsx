import { useId, useState } from "react";
import type { ComponentProps, SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, workosUrl } from "@/lib/api";
import type { User } from "@/lib/api";
import { usePreferences } from "@/lib/preferences";
export interface AuthConfig {
  authkit: boolean;
  password: boolean;
}
export function Auth({
  config,
  onLogin,
  run,
  busy,
  register = false,
  navigate,
}: {
  config: AuthConfig;
  onLogin: (user: User) => void;
  busy: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
  register?: boolean;
  navigate: (path: string) => void;
}) {
  const { t } = usePreferences();
  const [showPassword, setShowPassword] = useState(false);
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    void run(async () => {
      const result = await api<{ user: User }>(
        register ? "/auth/register" : "/auth/login",
        { method: "POST", body: JSON.stringify(data) },
      );
      onLogin(result.user);
    });
  }
  return (
    <div className="flex flex-1 items-center justify-center px-7 py-10">
      <div className="w-full max-w-[380px]">
        <div className="mb-9 text-center">
          <h1 className="roomies-wordmark text-[52px]">Roomies</h1>
          <p className="mt-3.5 text-base text-muted-foreground">
            {t(
              "Shared homes, clearer money and chores.",
              "Casas compartilhadas, contas e tarefas mais claras.",
              "Casas compartidas, cuentas y tareas más claras.",
            )}
          </p>
        </div>
        {config.authkit ? (
          <div className="grid gap-2">
            <Button
              size="lg"
              className="w-full"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const result = await api<{ url: string }>(
                    `/auth/workos/authorize?screen_hint=${register ? "sign-up" : "sign-in"}`,
                  );
                  window.location.assign(workosUrl(result.url, "authorize"));
                })
              }
            >
              {busy
                ? t("Redirecting…", "Redirecionando…", "Redirigiendo…")
                : register
                  ? t("Create account", "Criar conta", "Crear cuenta")
                  : t("Sign in", "Entrar", "Iniciar sesión")}
            </Button>
            {register && (
              <Button variant="ghost" onClick={() => navigate("/")}>
                {t(
                  "Already have an account? Sign in",
                  "Já tem conta? Entrar",
                  "¿Ya tienes cuenta? Inicia sesión",
                )}
              </Button>
            )}
          </div>
        ) : !register && !showPassword ? (
          <Button
            variant="outline"
            className="h-10 w-full"
            disabled={!config.password || busy}
            onClick={() => setShowPassword(true)}
          >
            {t(
              "Use email and password",
              "Usar email e senha",
              "Usar correo y contraseña",
            )}
          </Button>
        ) : config.password ? (
          <form onSubmit={submit} className="grid gap-2.5">
            {register && (
              <AuthField
                label={t("Your name", "Seu nome", "Tu nombre")}
                name="name"
                autoComplete="name"
                maxLength={100}
              />
            )}
            <AuthField
              label="Email"
              name="email"
              type="email"
              autoComplete="email"
            />
            <AuthField
              label={t("Password", "Senha", "Contraseña")}
              name="password"
              type="password"
              autoComplete={register ? "new-password" : "current-password"}
              minLength={8}
            />
            <Button size="lg" type="submit" className="mt-1" disabled={busy}>
              {busy
                ? t("Please wait…", "Aguarde…", "Espera…")
                : register
                  ? t("Create account", "Criar conta", "Crear cuenta")
                  : t("Sign in", "Entrar", "Iniciar sesión")}
            </Button>
            <div
              className={`flex items-center ${register ? "justify-center" : "justify-between"}`}
            >
              {!register && (
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setShowPassword(false)}
                >
                  {t("Hide", "Ocultar", "Ocultar")}
                </Button>
              )}
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => navigate(register ? "/" : "/register")}
              >
                {register
                  ? t(
                      "Already have an account? Sign in",
                      "Já tem conta? Entrar",
                      "¿Ya tienes cuenta? Inicia sesión",
                    )
                  : t("Create account", "Criar conta", "Crear cuenta")}
              </Button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}

function AuthField({
  label,
  ...props
}: ComponentProps<typeof Input> & { label: string }) {
  const id = useId();
  return (
    <div className="roomies-auth-field">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} required {...props} />
    </div>
  );
}
