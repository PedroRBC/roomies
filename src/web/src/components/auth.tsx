import { useState } from "react";
import type { SubmitEvent } from "react";
import { Home } from "lucide-react";
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

export interface AuthConfig {
  authkit: boolean;
  password: boolean;
}

export function Auth({
  config,
  onLogin,
  run,
  busy,
}: {
  config: AuthConfig;
  onLogin: (user: User) => void;
  busy: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
}) {
  const [register, setRegister] = useState(false);
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
    <div className="mx-auto grid w-full max-w-md gap-7 py-10 sm:py-20">
      <div className="flex items-center gap-3 text-2xl font-bold">
        <Home className="text-primary" aria-hidden="true" />
        Roomies
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">
            {register ? "Make yourself at home" : "Welcome home"}
          </CardTitle>
          <CardDescription>
            Shared expenses. Clear balances. A little less house admin.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          {config.authkit && (
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const result = await api<{ url: string }>(
                    "/auth/workos/authorize",
                  );
                  window.location.assign(workosUrl(result.url, "authorize"));
                })
              }
            >
              Continue with AuthKit
            </Button>
          )}
          {config.password && (
            <>
              <form onSubmit={submit} className="grid gap-5">
                {register && (
                  <Field
                    label="Your name"
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
                  label="Password"
                  name="password"
                  type="password"
                  autoComplete={register ? "new-password" : "current-password"}
                  required
                  minLength={8}
                />
                <Button disabled={busy} type="submit">
                  {busy
                    ? "Please wait…"
                    : register
                      ? "Create account"
                      : "Sign in"}
                </Button>
              </form>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setRegister(!register)}
              >
                {register
                  ? "Already have an account? Sign in"
                  : "New here? Create an account"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
