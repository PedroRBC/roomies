import { useEffect, useState } from "react";
import type { SubmitEvent } from "react";
import { Eye, EyeOff, Receipt, Wallet, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
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
  const [companyAuth, setCompanyAuth] = useState(false);
  const [google, setGoogle] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void api<{ company_auth?: boolean; google?: boolean }>("/auth/config")
      .then((config) => {
        if (active) { setCompanyAuth(Boolean(config.company_auth)); setGoogle(Boolean(config.google)); setAuthReady(true); }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  if (authReady && companyAuth) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-1 items-center justify-center px-5 py-10">
        <Card className="w-full max-w-[440px] p-8 text-center sm:p-10">
          <div className="roomies-wordmark text-[52px]">Roomies</div>
          <h1 className="mt-6 font-heading text-3xl font-semibold">{t("Welcome home", "Bem-vindo ao lar", "Bienvenido a casa")}</h1>
          <p className="mt-3.5 text-base text-muted-foreground">{t("Sign in securely with your Caldas Studios account. Your password and two-factor authentication stay with CompanyAuth.", "Entre com segurança usando sua conta Caldas Studios. Sua senha e autenticação de dois fatores ficam no CompanyAuth.", "Inicia sesión de forma segura con tu cuenta de Caldas Studios. Tu contraseña y autenticación de dos factores permanecen en CompanyAuth.")}</p>
          <Button className="mt-8 w-full" size="lg" onClick={() => window.location.assign(`/api/auth/${register ? "register" : "login"}`)}>
            {register ? t("Create or use your account", "Criar ou usar sua conta", "Crear o usar tu cuenta") : t("Continue with CompanyAuth", "Continuar com CompanyAuth", "Continuar con CompanyAuth")}
          </Button>
        </Card>
      </div>
    );
  }
  async function signInGoogle() {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ url: string }>("/auth/google", { method: "POST" });
      window.location.assign(result.url);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }
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
  return (
    <div className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-10 px-5 py-10 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-16 lg:py-16">
      <section className="hidden min-w-0 lg:block" aria-label="Roomies">
        <div className="roomies-wordmark mb-8 text-4xl">Roomies</div>
        <p className="font-heading text-5xl font-semibold leading-tight tracking-tight">{t("A home runs better together.", "Uma casa funciona melhor em conjunto.", "Un hogar funciona mejor en equipo.")}</p>
        <p className="mt-5 text-lg leading-relaxed text-muted-foreground">{t("Bring the things you share into one place.", "Reúna tudo o que vocês compartilham em um só lugar.", "Reúne todo lo que compartís en un solo lugar.")}</p>
        <ul className="mt-9 grid gap-5 text-sm">
          <li className="flex items-center gap-3"><Receipt className="size-5 text-primary" aria-hidden="true" />{t("Keep shared expenses together", "Organize as despesas compartilhadas", "Organiza los gastos compartidos")}</li>
          <li className="flex items-center gap-3"><Wallet className="size-5 text-primary" aria-hidden="true" />{t("Know who owes what", "Saiba quem deve o quê", "Sabe quién debe qué")}</li>
          <li className="flex items-center gap-3"><StickyNote className="size-5 text-primary" aria-hidden="true" />{t("Leave a note for your roommates", "Deixe uma nota para os moradores", "Deja una nota a tus compañeros")}</li>
        </ul>
      </section>
      <Card className="mx-auto w-full max-w-[440px] gap-0 p-6 sm:p-8">
        <div className="mb-9 text-center">
          <div className="roomies-wordmark text-[52px] lg:hidden">Roomies</div>
          <h1 className="mt-5 font-heading text-3xl font-semibold lg:mt-0">
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
          </h1>
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
                      className="absolute right-1 bottom-1"
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
                <Button variant="outline" disabled={busy} onClick={() => void signInGoogle()}>
                  {t("Continue with Google", "Continuar com Google", "Continuar con Google")}
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
      </Card>
    </div>
  );
}
