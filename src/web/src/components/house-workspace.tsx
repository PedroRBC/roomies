import { useEffect, useState } from "react";
import type { SubmitEvent } from "react";
import { ArrowRight, Receipt, StickyNote, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Field } from "./field";
import { api, money } from "@/lib/api";
import type { ApiError, House, HouseData, User } from "@/lib/api";

export function HouseWorkspace({
  house,
  user,
  onUnauthorized,
}: {
  house: House;
  user: User;
  onUnauthorized: () => void;
}) {
  const [data, setData] = useState<HouseData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("expenses");
  const [today] = useState(() => new Date().toLocaleDateString("en-CA"));
  const base = `/houses/${encodeURIComponent(house.id)}`;
  useEffect(() => {
    let active = true;
    Promise.all([
      api<HouseData["expenses"]>(`${base}/expenses`),
      api<HouseData["notes"]>(`${base}/notes`),
      api<HouseData["members"]>(`${base}/members`),
      api<HouseData["balances"]>(`${base}/balances`),
    ])
      .then(([expenses, notes, members, balances]) => {
        if (active) {
          setData({ expenses, notes, members, balances });
          setError("");
        }
      })
      .catch((err: ApiError) => {
        if (active) {
          setError(err.message);
          if (err.status === 401) onUnauthorized();
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [base, revision, onUnauthorized]);

  async function submit(
    event: SubmitEvent<HTMLFormElement>,
    kind: "expenses" | "notes",
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const body =
      kind === "expenses"
        ? { ...values, amount: Number(values.amount), visibility: "shared" }
        : values;
    setBusy(true);
    setError("");
    try {
      await api(`${base}/${kind}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      form.reset();
      setLoading(true);
      setRevision((value) => value + 1);
    } catch (err) {
      setError((err as Error).message);
      if ((err as ApiError).status === 401) onUnauthorized();
    } finally {
      setBusy(false);
    }
  }
  const canCreate = data?.members.some(
    (member) => member.user_id === user.id && member.role !== "monitor",
  );
  const ownBalance = data?.balances.balances?.find(
    (balance) => balance.user_id === user.id,
  );
  return (
    <section aria-label={house.name} className="grid gap-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-sm text-muted-foreground">
            Your shared space
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {house.name}
          </h1>
        </div>
        {data && (
          <Badge variant="secondary" className="gap-2 py-2">
            <Users size={15} aria-hidden="true" />
            {data.members.length} roommates
          </Badge>
        )}
      </header>
      {error && (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>{error}</span>
            <Button
              size="sm"
              variant="outline"
              disabled={loading}
              onClick={() => {
                setLoading(true);
                setRevision((value) => value + 1);
              }}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {loading && (
        <p role="status" className="text-muted-foreground">
          Loading your household…
        </p>
      )}
      {data && (
        <>
          <div className="border-y py-5">
            <p className="text-sm text-muted-foreground">Your balance</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">
              {money(ownBalance?.net ?? 0)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {(ownBalance?.net ?? 0) > 0
                ? "You are owed"
                : (ownBalance?.net ?? 0) < 0
                  ? "You owe"
                  : "You are all settled up"}
            </p>
          </div>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="mb-5">
              <TabsTrigger value="expenses">Expenses</TabsTrigger>
              <TabsTrigger value="balances">Balances</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
            </TabsList>
            <TabsContent
              value="expenses"
              className="grid items-start gap-6 lg:grid-cols-[1fr_340px]"
            >
              <div className="min-w-0">
                <h2 className="mb-4 text-xl font-semibold">Shared expenses</h2>
                {data.expenses.length === 0 && (
                  <Empty
                    icon="expense"
                    text="No expenses yet. Add the first thing you paid for together."
                  />
                )}
                <ul className="divide-y">
                  {data.expenses.map((expense) => (
                    <li
                      key={expense.id}
                      className="flex items-start justify-between gap-4 py-4"
                    >
                      <div className="min-w-0">
                        <p className="break-words font-medium">
                          {expense.description}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {expense.payer_name} paid on{" "}
                          {expense.date.slice(0, 10)}
                        </p>
                        {expense.category && (
                          <Badge variant="outline" className="mt-2">
                            {expense.category}
                          </Badge>
                        )}
                      </div>
                      <span className="shrink-0 font-semibold tabular-nums">
                        {money(expense.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              {canCreate && (
                <Card>
                  <CardHeader>
                    <CardTitle>Add an expense</CardTitle>
                    <CardDescription>
                      You paid; everyone shares equally. Monitors are excluded.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form
                      onSubmit={(event) => void submit(event, "expenses")}
                      className="grid gap-4"
                    >
                      <Field
                        label="What was it for?"
                        name="description"
                        required
                        maxLength={500}
                      />
                      <Field
                        label="Amount (USD)"
                        name="amount"
                        type="number"
                        min="0.01"
                        max="999999999"
                        step="0.01"
                        required
                      />
                      <Field
                        label="Date"
                        name="date"
                        type="date"
                        required
                        defaultValue={today}
                      />
                      <Field
                        label="Category (optional)"
                        name="category"
                        maxLength={100}
                      />
                      <Button disabled={busy || loading} type="submit">
                        {busy ? "Saving…" : "Add expense"}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
            <TabsContent value="balances" className="grid gap-8 lg:grid-cols-2">
              <div>
                <h2 className="mb-4 text-xl font-semibold">Who owes what</h2>
                <ul className="divide-y">
                  {(data.balances.balances ?? []).map((balance) => (
                    <li
                      key={balance.user_id}
                      className="flex items-center justify-between gap-4 py-4"
                    >
                      <div>
                        <p className="font-medium">
                          {balance.user_name}
                          {balance.user_id === user.id ? " (you)" : ""}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Paid {money(balance.paid)} · Share{" "}
                          {money(balance.owed)}
                        </p>
                      </div>
                      <span className="font-semibold tabular-nums">
                        {money(balance.net)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <Card>
                <CardHeader>
                  <CardTitle>Settle up</CardTitle>
                  <CardDescription>
                    Suggested transfers to balance your shared expenses.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y">
                    {(data.balances.settlements ?? []).map(
                      (settlement, index) => (
                        <li key={index} className="grid gap-2 py-3">
                          <p className="flex flex-wrap items-center gap-2">
                            {settlement.from_user_name}
                            <ArrowRight size={16} aria-label="pays" />
                            {settlement.to_user_name}
                          </p>
                          <p className="font-semibold tabular-nums">
                            {money(settlement.amount)}
                          </p>
                        </li>
                      ),
                    )}
                  </ul>
                  {!data.balances.settlements?.length && (
                    <p className="text-muted-foreground">
                      Everyone is settled up.
                    </p>
                  )}
                  <Separator className="my-4" />
                  <p className="text-sm text-muted-foreground">
                    Arrange transfers with your roommates. Roomies does not move
                    money.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent
              value="notes"
              className="grid items-start gap-6 lg:grid-cols-[1fr_340px]"
            >
              <div>
                <h2 className="mb-4 text-xl font-semibold">House notes</h2>
                {data.notes.length === 0 && (
                  <Empty
                    icon="note"
                    text="Keep the Wi-Fi details, house rules, and little reminders here."
                  />
                )}
                <div className="grid gap-4">
                  {data.notes.map((note) => (
                    <Card key={note.id}>
                      <CardHeader>
                        <CardTitle className="break-words">
                          {note.title}
                        </CardTitle>
                        <CardDescription>{note.author_name}</CardDescription>
                      </CardHeader>
                      <CardContent className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                        {note.content}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
              {canCreate && (
                <Card>
                  <CardHeader>
                    <CardTitle>Leave a note</CardTitle>
                    <CardDescription>
                      Something everyone should know.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form
                      onSubmit={(event) => void submit(event, "notes")}
                      className="grid gap-4"
                    >
                      <Field
                        label="Title"
                        name="title"
                        required
                        maxLength={200}
                      />
                      <Field
                        label="Note"
                        name="content"
                        multiline
                        required
                        maxLength={10000}
                      />
                      <Button disabled={busy || loading} type="submit">
                        {busy ? "Saving…" : "Add note"}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
    </section>
  );
}

function Empty({ icon, text }: { icon: "expense" | "note"; text: string }) {
  const Icon = icon === "expense" ? Receipt : StickyNote;
  return (
    <div className="flex gap-3 rounded-lg border border-dashed p-6 text-sm leading-relaxed text-muted-foreground">
      <Icon size={20} className="shrink-0" aria-hidden="true" />
      <p>{text}</p>
    </div>
  );
}
