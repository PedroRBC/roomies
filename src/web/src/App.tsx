import { useCallback, useEffect, useRef, useState } from "react";
import type { SubmitEvent } from "react";
import { Home, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Auth } from "@/components/auth";
import { Field } from "@/components/field";
import { HouseWorkspace } from "@/components/house-workspace";
import { api, ApiError } from "@/lib/api";
import type { House, User } from "@/lib/api";

async function bootstrap() {
  let user: User | null = null;
  try {
    user = await api<User>("/auth/me");
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401) throw err;
  }
  return { user };
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [houses, setHouses] = useState<House[]>([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [houseLoading, setHouseLoading] = useState(false);
  const startup = useRef<ReturnType<typeof bootstrap> | null>(null);
  const onUnauthorized = useCallback(() => {
    setUser(null);
    setHouses([]);
    setSelected("");
  }, []);

  useEffect(() => {
    let active = true;
    startup.current ??= bootstrap();
    startup.current
      .then((result) => {
        if (active) {
          setUser(result.user);
          setHouseLoading(!!result.user);
        }
      })
      .catch((err: Error) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    api<House[]>("/houses")
      .then((result) => {
        if (active) {
          setHouses(result);
          setSelected(result[0]?.id ?? "");
        }
      })
      .catch((err: ApiError) => {
        if (active) {
          setError(err.message);
          if (err.status === 401) onUnauthorized();
        }
      })
      .finally(() => {
        if (active) setHouseLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user, onUnauthorized]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
      if ((err as ApiError).status === 401) onUnauthorized();
    } finally {
      setBusy(false);
    }
  }
  function createHouse(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name")).trim();
    void run(async () => {
      const house = await api<House>("/houses", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setHouses((current) => [...current, house]);
      setSelected(house.id);
      form.reset();
    });
  }
  const house = houses.find((item) => item.id === selected);
  return (
    <div className="min-h-svh bg-background text-foreground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-background focus:p-4"
      >
        Skip to content
      </a>
      {user && (
        <header className="border-b bg-card">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
            <span className="flex items-center gap-2 text-xl font-bold">
              <Home className="text-primary" aria-hidden="true" />
              Roomies
            </span>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">{user.name}</span>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await api("/auth/logout", { method: "POST" });
                    onUnauthorized();
                  })
                }
              >
                <LogOut size={16} aria-hidden="true" />
                Sign out
              </Button>
            </div>
          </div>
        </header>
      )}
      <main id="main" className="mx-auto max-w-7xl px-5 py-6 sm:px-8 sm:py-9">
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>
              <span>{error}</span>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => window.location.reload()}
              >
                Reload
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {loading ? (
          <p role="status">Opening Roomies…</p>
        ) : !user ? (
          (
            <Auth
              onLogin={(user) => {
                setHouseLoading(true);
                setUser(user);
              }}
            />
          )
        ) : (
          <div className="grid items-start gap-9 md:grid-cols-[220px_1fr] lg:gap-12">
            <aside
              className="grid gap-6 md:sticky md:top-8"
              aria-label="Households"
            >
              {houses.length > 0 && (
                <div className="grid gap-2">
                  <Label htmlFor="house">Your house</Label>
                  <Select
                    value={selected}
                    onValueChange={(value) => {
                      if (value) setSelected(value);
                    }}
                  >
                    <SelectTrigger id="house" className="w-full">
                      <SelectValue placeholder="Choose a house">
                        {house?.name}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {houses.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {houses.length
                      ? "Another shared space?"
                      : "Start your household"}
                  </CardTitle>
                  <CardDescription>
                    Create a house for your roommates.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={createHouse} className="grid gap-3">
                    <Field
                      label="House name"
                      name="name"
                      required
                      maxLength={100}
                    />
                    <Button
                      type="submit"
                      variant="outline"
                      disabled={busy || houseLoading}
                    >
                      Create house
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </aside>
            {houseLoading ? (
              <p role="status">Loading your houses…</p>
            ) : house ? (
              <HouseWorkspace
                key={house.id}
                house={house}
                user={user}
                onUnauthorized={onUnauthorized}
              />
            ) : (
              <div className="py-12">
                <h1 className="text-3xl font-semibold tracking-tight">
                  A place for the things you share.
                </h1>
                <p className="mt-4 max-w-md leading-relaxed text-muted-foreground">
                  Create your first house to track expenses, see who owes what,
                  and keep everyone on the same page.
                </p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
