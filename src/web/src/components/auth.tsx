import { useState } from "react";
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
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = Object.fromEntries(new FormData(event.currentTarget));
    data.email = String(data.email).trim();
    if (register) data.name = String(data.name).trim();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ user: User }>(register ? "/auth/register" : "/auth/login", {
        method: "POST", body: JSON.stringify(data),
      });
      onLogin(result.user);
    } catch (err) {
      setError((err as Error).message);
    } finally { setBusy(false); }
  }
  return (
    <div className="mx-auto grid w-full max-w-md gap-7 py-10 sm:py-20">
      <div className="flex items-center gap-3 text-2xl font-bold">
        <Home className="text-primary" aria-hidden="true" />Roomies
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl">{register ? "Make yourself at home" : "Welcome home"}</CardTitle>
          <CardDescription>{register ? "Create your account, then join your roommates or start a house." : "Sign in to your shared expenses, notes, and household."}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <form onSubmit={submit} aria-busy={busy}>
            <fieldset disabled={busy} className="grid gap-5">
              {register && <Field label="Your name" name="name" autoComplete="name" required maxLength={100} />}
              <Field label="Email" name="email" type="email" autoComplete="email" autoCapitalize="none" required maxLength={254} />
              <div className="relative">
                <Field label="Password" name="password" type={showPassword ? "text" : "password"} autoComplete={register ? "new-password" : "current-password"} required minLength={8} maxLength={128} className="pr-12" />
                <Button className="absolute right-1 bottom-0.5" type="button" size="icon" variant="ghost" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </Button>
              </div>
              {register && <p className="text-sm text-muted-foreground">Use at least 8 characters for your password.</p>}
              <Button type="submit">{busy ? (register ? "Creating account…" : "Signing in…") : register ? "Create account" : "Sign in"}</Button>
            </fieldset>
          </form>
          <div className="border-t pt-4 text-center text-sm text-muted-foreground">
            <p>{register ? "Already have an account?" : "New to Roomies?"}</p>
            <Button variant="link" disabled={busy} onClick={() => { setRegister(!register); setError(""); setShowPassword(false); }}>
              {register ? "Sign in instead" : "Create an account"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
