import { useEffect, useState } from "react";
import type { SubmitEvent } from "react";
import { Eye, EyeOff, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field } from "./field";
import { api } from "@/lib/api";
import type { User } from "@/lib/api";

export function Auth({ onLogin }: { onLogin: (user: User) => void }) {
  const [register, setRegister] = useState(false);
  const [factor, setFactor] = useState(false);
  const [backup, setBackup] = useState(false);
  const [google, setGoogle] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { let active = true; void api<{ google: boolean }>("/auth/config").then(config => { if (active) setGoogle(config.google); }).catch(() => {}); return () => { active = false; }; }, []);
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = Object.fromEntries(new FormData(event.currentTarget));
    if (!factor) {
      data.email = String(data.email).trim();
      if (register) data.name = String(data.name).trim();
    }
    setBusy(true); setError("");
    try {
      const path = factor ? `/auth/two-factor/verify-${backup ? "backup-code" : "totp"}` : register ? "/auth/register" : "/auth/login";
      const result = await api<{ user?: User; two_factor_required?: boolean }>(path, { method: "POST", body: JSON.stringify(data) });
      if (result.two_factor_required) { setFactor(true); return; }
      if (!result.user) throw new Error("Sign-in could not be completed. Try again.");
      onLogin(result.user);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  async function signInGoogle() {
    setBusy(true); setError("");
    try {
      const result = await api<{ url: string }>("/auth/google", { method: "POST" });
      window.location.assign(result.url);
    } catch (err) { setError((err as Error).message); setBusy(false); }
  }
  return (
    <div className="mx-auto grid w-full max-w-md gap-7 py-10 sm:py-20">
      <div className="flex items-center gap-3 text-2xl font-bold"><Home className="text-primary" aria-hidden="true" />Roomies</div>
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl">{factor ? "Two-factor authentication" : register ? "Make yourself at home" : "Welcome home"}</CardTitle>
          <CardDescription>{factor ? "Enter the code from your authenticator app, or use a recovery code." : register ? "Create your account, then join your roommates or start a house." : "Sign in to your shared expenses, notes, and household."}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <form key={factor ? `factor-${backup}` : String(register)} onSubmit={submit} aria-busy={busy}>
            <fieldset disabled={busy} className="grid gap-5">
              {factor ? <Field label={backup ? "Recovery code" : "Authenticator code"} name="code" autoComplete="one-time-code" inputMode={backup ? "text" : "numeric"} pattern={backup ? undefined : "[0-9]{6}"} required maxLength={backup ? 32 : 6} autoFocus /> : <>
                {register && <Field label="Your name" name="name" autoComplete="name" required maxLength={100} />}
                <Field label="Email" name="email" type="email" autoComplete="email" autoCapitalize="none" required maxLength={254} />
                <div className="relative">
                  <Field label="Password" name="password" type={showPassword ? "text" : "password"} autoComplete={register ? "new-password" : "current-password"} required minLength={8} maxLength={128} className="pr-12" />
                  <Button className="absolute right-1 bottom-0.5" type="button" size="icon" variant="ghost" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</Button>
                </div>
              </>}
              <Button type="submit" size="lg">{busy ? "Please wait…" : factor ? "Verify" : register ? "Create account" : "Sign in"}</Button>
            </fieldset>
          </form>
          {factor ? <>
            <Button variant="ghost" disabled={busy} onClick={() => { setBackup(!backup); setError(""); }}>{backup ? "Use authenticator app" : "Use a recovery code"}</Button>
            <Button variant="ghost" disabled={busy} onClick={() => { setFactor(false); setBackup(false); setError(""); }}>Back to sign in</Button>
          </> : <>
            {google && <Button variant="outline" disabled={busy} onClick={() => void signInGoogle()}>Continue with Google</Button>}
            <Button variant="ghost" disabled={busy} onClick={() => { setRegister(!register); setError(""); }}>{register ? "Already have an account? Sign in" : "Create an account"}</Button>
          </>}
        </CardContent>
      </Card>
    </div>
  );
}
