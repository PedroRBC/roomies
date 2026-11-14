import { useEffect, useState } from "react";
import type { SubmitEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field } from "./field";
import { api } from "@/lib/api";
import { usePreferences } from "@/lib/preferences";
import type { User } from "@/lib/api";

export function Auth({
  onLogin,
  register: routeRegister,
  navigate,
}: {
  onLogin: (user: User) => void;
  register?: boolean;
  navigate?: (path: string) => void;
}) {
  const { t } = usePreferences();
  const [localRegister, setRegister] = useState(false);
  const register = routeRegister ?? localRegister;
  const [factor, setFactor] = useState(false);
  const [backup, setBackup] = useState(false);
  const [google, setGoogle] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void api<{ google: boolean }>("/auth/config")
      .then((config) => {
        if (active) setGoogle(config.google);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = Object.fromEntries(new FormData(event.currentTarget));
    if (!factor) {
      data.email = String(data.email).trim();
      if (register) data.name = String(data.name).trim();
    }
    setBusy(true);
    setError("");
    try {
      const path = factor
        ? `/auth/two-factor/verify-${backup ? "backup-code" : "totp"}`
        : register
          ? "/auth/register"
          : "/auth/login";
      const result = await api<{ user?: User; two_factor_required?: boolean }>(
        path,
        { method: "POST", body: JSON.stringify(data) },
      );
      if (result.two_factor_required) {
        setFactor(true);
        return;
      }
      if (!result.user)
        throw new Error("Sign-in could not be completed. Try again.");
      onLogin(result.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function signInGoogle() {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ url: string }>("/auth/google", {
        method: "POST",
      });
      window.location.assign(result.url);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-1 items-center justify-center px-7 py-10">
      <div className="w-full max-w-[380px]">
        <div className="mb-9 text-center">
          <h1 className="roomies-wordmark text-[52px]">Roomies</h1>
          <h2 className="mt-5 text-2xl font-bold">
            {factor
              ? t(
                  "Two-factor authentication",
                  "Autenticação de dois fatores",
                  "Autenticación de dos factores",
                )
              : register
                ? t(
                    "Make yourself at home",
                    "Sinta-se em casa",
                    "Siéntete en casa",
                  )
                : t("Welcome home", "Bem-vindo ao lar", "Bienvenido a casa")}
          </h2>
          <p className="mt-3.5 text-base text-muted-foreground">
            {factor
              ? t(
                  "Enter the code from your authenticator app, or use a recovery code.",
                  "Digite o código do autenticador ou use um código de recuperação.",
                  "Introduce el código de tu autenticador o usa un código de recuperación.",
                )
              : register
                ? t(
                    "Create your account, then join your roommates or start a house.",
                    "Crie sua conta e entre em uma casa ou crie a sua.",
                    "Crea tu cuenta y únete a una casa o crea la tuya.",
                  )
                : t(
                    "Sign in to your shared expenses, notes, and household.",
                    "Entre para acessar as despesas, notas e tarefas da casa.",
                    "Entra para acceder a los gastos, notas y tareas de la casa.",
                  )}
          </p>
        </div>
        <div className="grid gap-5">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <form
            key={factor ? `factor-${backup}` : String(register)}
            onSubmit={submit}
            aria-busy={busy}
          >
            <fieldset disabled={busy} className="grid gap-5">
              {factor ? (
                <Field
                  label={
                    backup
                      ? t(
                          "Recovery code",
                          "Código de recuperação",
                          "Código de recuperación",
                        )
                      : t(
                          "Authenticator code",
                          "Código do autenticador",
                          "Código del autenticador",
                        )
                  }
                  name="code"
                  autoComplete="one-time-code"
                  inputMode={backup ? "text" : "numeric"}
                  pattern={backup ? undefined : "[0-9]{6}"}
                  required
                  maxLength={backup ? 32 : 6}
                  autoFocus
                />
              ) : (
                <>
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
                    autoCapitalize="none"
                    required
                    maxLength={254}
                  />
                  <div className="relative">
                    <Field
                      label={t("Password", "Senha", "Contraseña")}
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete={
                        register ? "new-password" : "current-password"
                      }
                      required
                      minLength={8}
                      maxLength={128}
                      className="pr-12"
                    />
                    <Button
                      className="absolute right-1 bottom-0.5"
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={
                        showPassword
                          ? t(
                              "Hide password",
                              "Ocultar senha",
                              "Ocultar contraseña",
                            )
                          : t(
                              "Show password",
                              "Mostrar senha",
                              "Mostrar contraseña",
                            )
                      }
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff aria-hidden="true" />
                      ) : (
                        <Eye aria-hidden="true" />
                      )}
                    </Button>
                  </div>
                </>
              )}
              <Button type="submit" size="lg">
                {busy
                  ? t("Please wait…", "Aguarde…", "Espera…")
                  : factor
                    ? t("Verify", "Verificar", "Verificar")
                    : register
                      ? t("Create account", "Criar conta", "Crear cuenta")
                      : t("Sign in", "Entrar", "Iniciar sesión")}
              </Button>
            </fieldset>
          </form>
          {factor ? (
            <>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setBackup(!backup);
                  setError("");
                }}
              >
                {backup
                  ? t(
                      "Use authenticator app",
                      "Usar aplicativo autenticador",
                      "Usar aplicación autenticadora",
                    )
                  : t(
                      "Use a recovery code",
                      "Usar código de recuperação",
                      "Usar código de recuperación",
                    )}
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setFactor(false);
                  setBackup(false);
                  setError("");
                }}
              >
                {t("Back to sign in", "Voltar para entrar", "Volver al inicio")}
              </Button>
            </>
          ) : (
            <>
              {google && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void signInGoogle()}
                >
                  {t(
                    "Continue with Google",
                    "Continuar com Google",
                    "Continuar con Google",
                  )}
                </Button>
              )}
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  if (navigate) navigate(register ? "/" : "/register");
                  else setRegister(!register);
                  setError("");
                }}
              >
                {register
                  ? t(
                      "Already have an account? Sign in",
                      "Já tem conta? Entrar",
                      "¿Ya tienes cuenta? Inicia sesión",
                    )
                  : t(
                      "Create an account",
                      "Criar uma conta",
                      "Crear una cuenta",
                    )}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
