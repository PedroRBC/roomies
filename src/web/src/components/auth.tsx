import type { SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field } from "./field";
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
    <div className="mx-auto grid w-full max-w-md gap-7 py-10 sm:py-16">
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 className="text-2xl">
              {register
                ? t(
                    "Make yourself at home",
                    "Sinta-se em casa",
                    "Siéntete como en casa",
                  )
                : t(
                    "Welcome home",
                    "Bem-vindo à sua casa",
                    "Bienvenido a casa",
                  )}
            </h1>
          </CardTitle>
          <CardDescription>
            {t(
              "Shared expenses. Clear balances. A little less house admin.",
              "Despesas compartilhadas. Saldos claros. Menos trabalho para cuidar da casa.",
              "Gastos compartidos. Saldos claros. Menos trabajo para gestionar la casa.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          {config.authkit && (
            <Button
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
              {t(
                "Continue with AuthKit",
                "Continuar com AuthKit",
                "Continuar con AuthKit",
              )}
            </Button>
          )}
          {config.password && (
            <form onSubmit={submit} className="grid gap-5">
              {register && (
                <Field
                  label={t("Your name", "Seu nome", "Tu nombre")}
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={100}
                />
              )}
              <Field
                label="Email"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
              <Field
                label={t("Password", "Senha", "Contraseña")}
                name="password"
                type="password"
                autoComplete={register ? "new-password" : "current-password"}
                required
                minLength={8}
              />
              <Button disabled={busy} type="submit">
                {busy
                  ? t("Please wait…", "Aguarde…", "Espera…")
                  : register
                    ? t("Create account", "Criar conta", "Crear cuenta")
                    : t("Sign in", "Entrar", "Iniciar sesión")}
              </Button>
            </form>
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
              : t(
                  "New here? Create an account",
                  "Chegou agora? Crie uma conta",
                  "¿Eres nuevo? Crea una cuenta",
                )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
