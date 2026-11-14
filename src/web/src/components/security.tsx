import { useState } from "react";
import type { SubmitEvent } from "react";
import { QRCodeSVG } from "qrcode.react";
import { api } from "@/lib/api";
import type { User } from "@/lib/api";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Alert, AlertDescription } from "./ui/alert";
import { Field } from "./field";

export function Security({ user, onChange }: { user: User; onChange: (user: User) => void }) {
  const [setup, setSetup] = useState<{ totpURI: string; backupCodes: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [backup, setBackup] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    setBusy(true); setError("");
    try {
      if (setup) {
        await api("/auth/two-factor/verify-totp", { method: "POST", body: JSON.stringify(data) });
        onChange(await api<User>("/auth/me")); setSetup(null); setSaved(false);
      } else if (user.two_factor_enabled) {
        await api("/auth/two-factor/disable", { method: "POST", body: JSON.stringify({ ...data, backup }) });
        onChange(await api<User>("/auth/me"));
      } else {
        setSetup(await api("/auth/two-factor/enable", { method: "POST", body: JSON.stringify(data) }));
      }
      form.reset();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  return <Card className="mb-6 max-w-xl">
    <CardHeader><CardTitle>Two-factor authentication</CardTitle><CardDescription>{user.two_factor_enabled ? "Your account is protected by an authenticator app." : "Add a second step to sign in with an app such as Google Authenticator, 1Password or Aegis."}</CardDescription></CardHeader>
    <CardContent className="grid gap-4">
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <form onSubmit={submit} aria-busy={busy}>
        <fieldset disabled={busy} className="grid gap-4">
          {setup ? <>
            <p>Scan this QR code with your authenticator app.</p>
            <div className="w-fit rounded-lg bg-white p-4"><QRCodeSVG value={setup.totpURI} size={200} title="Authenticator setup QR code" /></div>
            <details><summary>Enter the setup key manually</summary><p className="break-all font-mono">{new URL(setup.totpURI).searchParams.get("secret")}</p></details>
            <p>Save these recovery codes somewhere safe. Each code can be used once if you lose your authenticator.</p>
            <ul className="grid grid-cols-2 gap-2 font-mono">{setup.backupCodes.map(code => <li key={code}>{code}</li>)}</ul>
            <label className="flex items-center gap-2"><input type="checkbox" checked={saved} onChange={event => setSaved(event.target.checked)} required />I saved my recovery codes</label>
            <Field label="Authenticator code" name="code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" required maxLength={6} />
          </> : <>
            <Field label="Current password (leave blank for Google-only accounts)" name="password" type="password" autoComplete="current-password" maxLength={128} />
            {user.two_factor_enabled && <>
              <Field label={backup ? "Recovery code" : "Authenticator code"} name="code" autoComplete="one-time-code" inputMode={backup ? "text" : "numeric"} pattern={backup ? undefined : "[0-9]{6}"} maxLength={backup ? 32 : 6} />
              <p className="text-sm text-muted-foreground">Code is optional if you signed in within the last 5 minutes.</p>
              <label className="flex items-center gap-2"><input type="checkbox" checked={backup} onChange={event => setBackup(event.target.checked)} />Use a recovery code</label>
            </>}
          </>}
          <Button type="submit" disabled={!!setup && !saved}>{busy ? "Please wait…" : setup ? "Confirm authenticator" : user.two_factor_enabled ? "Disable two-factor authentication" : "Set up authenticator"}</Button>
        </fieldset>
      </form>
    </CardContent>
  </Card>;
}
