import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { api, ApiError } from "@/lib/api";
import { PreferencesProvider } from "@/lib/preferences";
import type { FeatureProps } from "@/lib/features";
import { Expenses } from "./expenses";
import { Notes } from "./notes";
import { Balances } from "./balances";
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: vi.fn(),
}));
const props: FeatureProps = {
  houseId: "home",
  user: { id: "me", name: "Alex", email: "alex@example.com" },
  role: "member",
  members: [
    { user_id: "me", user_name: "Alex", role: "member" },
    { user_id: "bea", user_name: "Bea", role: "admin" },
    { user_id: "monitor", user_name: "Mo", role: "monitor" },
  ],
  onUnauthorized: vi.fn(),
  onChanged: vi.fn(),
};
const expense = {
  id: "e",
  house_id: "home",
  payer_id: "me",
  payer_name: "Alex",
  amount: 10.01,
  description: "Groceries",
  category: "Food",
  date: "2026-11-14",
  visibility: "shared",
  created_at: "2026-11-14T12:00:00Z",
};
const note = {
  id: "n",
  house_id: "home",
  author_id: "me",
  author_name: "Alex",
  title: "Kitchen",
  content: "Clean up",
  created_at: "2026-11-14T12:00:00Z",
  updated_at: "2026-11-14T12:00:00Z",
};
const detail = {
  expense,
  splits: [
    {
      id: "s",
      expense_id: "e",
      user_id: "me",
      user_name: "Alex",
      share_amount: 10.01,
    },
  ],
};
function defaults(path: string, options?: RequestInit): unknown {
  if (options?.method) return {};
  if (path.endsWith("/expenses/e")) return detail;
  if (path.endsWith("/expenses")) return [expense];
  if (path.endsWith("/notes")) return [note];
  if (path.endsWith("/balances"))
    return {
      balances: [
        { user_id: "me", user_name: "Alex", paid: 10, owed: 5, net: 5 },
        { user_id: "bea", user_name: "Bea", paid: 0, owed: 5, net: -5 },
      ],
      settlements: [
        {
          from_user_id: "bea",
          from_user_name: "Bea",
          to_user_id: "me",
          to_user_name: "Alex",
          amount: 5,
        },
      ],
    };
  throw new Error(`Unexpected path ${path}`);
}
beforeEach(() => {
  localStorage.clear();
  vi.mocked(api).mockImplementation(async (path, options) =>
    defaults(path, options),
  );
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
function show(
  Component: typeof Expenses,
  overrides: Partial<FeatureProps> = {},
) {
  return render(
    <PreferencesProvider>
      <Component {...props} {...overrides} />
    </PreferencesProvider>,
  );
}

async function choose(
  actor: ReturnType<typeof userEvent.setup>,
  label: string,
  option: string,
) {
  await actor.click(screen.getByRole("combobox", { name: label }));
  await actor.click(await screen.findByRole("option", { name: option }));
}

it("creates a private expense with exact custom splits and monitor visibility only", async () => {
  const actor = userEvent.setup();
  show(Expenses);
  await actor.click(await screen.findByRole("button", { name: "Add expense" }));
  await actor.type(screen.getByLabelText("Amount"), "10,01");
  await actor.type(screen.getByLabelText("Description"), "Dinner");
  await choose(actor, "Visibility", "Private");
  await actor.click(screen.getByRole("checkbox", { name: "Mo" }));
  await choose(actor, "Custom splits", "Custom splits");
  expect(screen.queryByLabelText("Share for Mo")).not.toBeInTheDocument();
  await actor.type(screen.getByLabelText("Share for Alex"), "5");
  await actor.type(screen.getByLabelText("Share for Bea"), "5.01");
  await actor.click(screen.getByRole("button", { name: "Save expense" }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      "/houses/home/expenses",
      expect.objectContaining({ method: "POST", body: expect.any(String) }),
    ),
  );
  const call = vi
    .mocked(api)
    .mock.calls.find(([, init]) => init?.method === "POST")!;
  expect(JSON.parse(call[1]!.body as string)).toMatchObject({
    amount: 10.01,
    description: "Dinner",
    visibility: "private",
    visible_to: ["monitor"],
    split: [
      { user_id: "me", amount: 5 },
      { user_id: "bea", amount: 5.01 },
    ],
  });
  expect(props.onChanged).toHaveBeenCalledTimes(1);
});
it("keeps expense inputs and custom splits after a failed save and allows retry", async () => {
  let failed = true;
  vi.mocked(api).mockImplementation(async (path, options) => {
    if (options?.method === "POST" && failed)
      throw new ApiError(403, "Permission changed");
    return defaults(path, options);
  });
  const actor = userEvent.setup();
  show(Expenses);
  await actor.click(await screen.findByRole("button", { name: "Add expense" }));
  await actor.type(screen.getByLabelText("Amount"), "12.34");
  await actor.type(screen.getByLabelText("Description"), "Dinner");
  await choose(actor, "Custom splits", "Custom splits");
  await actor.type(screen.getByLabelText("Share for Alex"), "6");
  await actor.type(screen.getByLabelText("Share for Bea"), "6.34");
  await actor.click(screen.getByRole("button", { name: "Save expense" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Permission changed",
  );
  expect(screen.getByLabelText("Amount")).toHaveValue("12.34");
  expect(screen.getByLabelText("Description")).toHaveValue("Dinner");
  expect(props.onChanged).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Share for Bea")).toHaveValue("6.34");
  failed = false;
  await actor.click(screen.getByRole("button", { name: "Save expense" }));
  await waitFor(() => expect(props.onChanged).toHaveBeenCalledTimes(1));
});
it("blocks invalid money before sending an expense", async () => {
  const actor = userEvent.setup();
  show(Expenses);
  await actor.click(await screen.findByRole("button", { name: "Add expense" }));
  await actor.type(screen.getByLabelText("Amount"), "1.001");
  await actor.type(screen.getByLabelText("Description"), "Dinner");
  await actor.click(screen.getByRole("button", { name: "Save expense" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("positive amount");
  expect(
    vi.mocked(api).mock.calls.some(([, init]) => init?.method === "POST"),
  ).toBe(false);
});
it("shows persisted detail splits and preserves them on metadata edits", async () => {
  const actor = userEvent.setup();
  show(Expenses);
  await actor.click(
    await screen.findByRole("button", { name: "Details / edit" }),
  );
  const dialog = await screen.findByRole("dialog");
  await actor.click(
    within(dialog).getByText("Current splits", { selector: "summary" }),
  );
  expect(
    within(dialog).getByRole("table", { name: "Current splits" }),
  ).toHaveTextContent("Alex");
  await actor.clear(within(dialog).getByLabelText("Description"));
  await actor.type(
    within(dialog).getByLabelText("Description"),
    "Weekly groceries",
  );
  await actor.click(
    within(dialog).getByRole("button", { name: "Save changes" }),
  );
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/houses/home/expenses/e", {
      method: "PUT",
      body: JSON.stringify({
        amount: 10.01,
        description: "Weekly groceries",
        category: "Food",
        date: "2026-11-14",
      }),
    }),
  );
});
it("allows visible-expense admin editing without exposing payer-only visibility controls", async () => {
  const actor = userEvent.setup();
  show(Expenses, { role: "admin", user: { ...props.user, id: "bea" } });
  await actor.click(
    await screen.findByRole("button", { name: "Details / edit" }),
  );
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Change visibility" }),
  ).not.toBeInTheDocument();
});
it("requires an explicit visibility replacement and uses its dedicated endpoint", async () => {
  const actor = userEvent.setup();
  show(Expenses);
  await actor.click(
    await screen.findByRole("button", { name: "Details / edit" }),
  );
  await actor.click(
    await screen.findByRole("button", { name: "Change visibility" }),
  );
  await choose(actor, "Visibility", "Private");
  await actor.click(screen.getByRole("checkbox", { name: "Bea" }));
  await actor.click(screen.getByRole("button", { name: "Save visibility" }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/houses/home/expenses/e/visibility", {
      method: "POST",
      body: JSON.stringify({ visibility: "private", visible_to: ["bea"] }),
    }),
  );
});
it("requires confirmation and retains a failed expense deletion for retry", async () => {
  vi.mocked(api).mockImplementation(async (path, options) => {
    if (options?.method === "DELETE") throw new ApiError(500, "Try later");
    return defaults(path, options);
  });
  const actor = userEvent.setup();
  show(Expenses);
  await actor.click(await screen.findByRole("button", { name: "Delete" }));
  expect(
    vi.mocked(api).mock.calls.some(([, init]) => init?.method === "DELETE"),
  ).toBe(false);
  await actor.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Confirm delete",
    }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Try later");
  expect(screen.getByRole("alertdialog")).toBeInTheDocument();
});
it("denies monitors expense and note mutations, including their own records", async () => {
  const expenses = show(Expenses, { role: "monitor" });
  await screen.findByRole("heading", { name: "Groceries" });
  expect(
    screen.queryByRole("button", {
      name: /Add expense|Delete|Details \/ edit/,
    }),
  ).not.toBeInTheDocument();
  expenses.unmount();
  show(Notes, { role: "monitor" });
  await screen.findByRole("heading", { name: "Kitchen" });
  expect(
    screen.queryByRole("button", { name: /Save note|Edit|Delete/ }),
  ).not.toBeInTheDocument();
});
it("keeps note text on failed create and trims a successful retry", async () => {
  let fail = true;
  vi.mocked(api).mockImplementation(async (path, options) => {
    if (options?.method === "POST" && fail)
      throw new ApiError(500, "Not saved");
    return defaults(path, options);
  });
  const actor = userEvent.setup();
  show(Notes);
  await actor.type(screen.getByLabelText("Title"), " Reminder ");
  await actor.type(screen.getByLabelText("Content"), " Buy soap ");
  await actor.click(screen.getByRole("button", { name: "Save note" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Not saved");
  expect(screen.getByLabelText("Content")).toHaveValue(" Buy soap ");
  fail = false;
  await actor.click(screen.getByRole("button", { name: "Save note" }));
  await waitFor(() => expect(screen.getByLabelText("Content")).toHaveValue(""));
  expect(api).toHaveBeenCalledWith("/houses/home/notes", {
    method: "POST",
    body: JSON.stringify({ title: "Reminder", content: "Buy soap" }),
  });
});
it("allows admin note edits and confirms note deletion", async () => {
  const actor = userEvent.setup();
  show(Notes, { role: "admin", user: { ...props.user, id: "bea" } });
  await actor.click(await screen.findByRole("button", { name: "Edit" }));
  const dialog = await screen.findByRole("dialog");
  await actor.clear(within(dialog).getByLabelText("Content"));
  await actor.type(within(dialog).getByLabelText("Content"), "Clean daily");
  await actor.click(
    within(dialog).getByRole("button", { name: "Save changes" }),
  );
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/houses/home/notes/n", {
      method: "PUT",
      body: JSON.stringify({ title: "Kitchen", content: "Clean daily" }),
    }),
  );
  await actor.click(screen.getByRole("button", { name: "Delete" }));
  await actor.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Confirm delete",
    }),
  );
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/houses/home/notes/n", {
      method: "DELETE",
    }),
  );
});
it("hides actions for another member’s note", async () => {
  show(Notes, { user: { ...props.user, id: "bea" } });
  await screen.findByRole("heading", { name: "Kitchen" });
  expect(
    screen.queryByRole("button", { name: "Edit" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Delete" }),
  ).not.toBeInTheDocument();
});
it("reports unauthorized reads and provides retry", async () => {
  vi.mocked(api).mockRejectedValue(new ApiError(401, "Session expired"));
  show(Balances);
  expect(await screen.findByRole("alert")).toHaveTextContent("Session expired");
  expect(props.onUnauthorized).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
});
it("ignores a stale house response and clears the old house form", async () => {
  let resolveOld!: (value: unknown) => void;
  vi.mocked(api).mockImplementation((path, options) =>
    path === "/houses/home/expenses"
      ? new Promise((resolve) => {
          resolveOld = resolve;
        })
      : Promise.resolve(
          path === "/houses/new/expenses"
            ? [{ ...expense, description: "New house expense" }]
            : defaults(path, options),
        ),
  );
  const actor = userEvent.setup();
  const view = show(Expenses);
  await actor.click(screen.getByRole("button", { name: "Add expense" }));
  await actor.type(screen.getByLabelText("Description"), "Old private draft");
  view.rerender(
    <PreferencesProvider>
      <Expenses {...props} houseId="new" />
    </PreferencesProvider>,
  );
  await screen.findByRole("heading", { name: "New house expense" });
  await act(async () => {
    resolveOld([expense]);
  });
  expect(
    screen.queryByRole("heading", { name: "Groceries" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByDisplayValue("Old private draft"),
  ).not.toBeInTheDocument();
});
it("renders paid, owed, net and suggested settlements without payment mutations", async () => {
  show(Balances);
  const cards = await screen.findAllByRole("article");
  expect(cards).toHaveLength(2);
  expect(cards[0]).toHaveTextContent("AlexPaid $10.00; owed $5.00; net $5.00");
  expect(cards[1]).toHaveTextContent("BeaPaid $0.00; owed $5.00; net -$5.00");
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  expect(screen.getByText("Bea pays Alex $5.00")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /pay|settle/i }),
  ).not.toBeInTheDocument();
});

it("requires replacement splits for changed amounts and submits an equal replacement to the cent", async () => {
  const actor = userEvent.setup();
  show(Expenses);
  await actor.click(
    await screen.findByRole("button", { name: "Details / edit" }),
  );
  const dialog = await screen.findByRole("dialog");
  await actor.click(
    within(dialog).getByText("More options", { selector: "summary" }),
  );
  await actor.clear(within(dialog).getByLabelText("Amount"));
  await actor.type(within(dialog).getByLabelText("Amount"), "20.01");
  await actor.click(
    within(dialog).getByRole("button", { name: "Save changes" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "replacement splits",
  );
  expect(
    vi.mocked(api).mock.calls.some(([, init]) => init?.method === "PUT"),
  ).toBe(false);
  await choose(actor, "Custom splits", "Equal split");
  await actor.click(
    within(dialog).getByRole("button", { name: "Save changes" }),
  );
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/houses/home/expenses/e", {
      method: "PUT",
      body: JSON.stringify({
        amount: 20.01,
        description: "Groceries",
        category: "Food",
        date: "2026-11-14",
        split: [
          { user_id: "me", amount: 10.01 },
          { user_id: "bea", amount: 10 },
        ],
      }),
    }),
  );
});
it("clears private recipients from the payload after switching back to shared", async () => {
  const actor = userEvent.setup();
  show(Expenses);
  await actor.click(await screen.findByRole("button", { name: "Add expense" }));
  await actor.type(screen.getByLabelText("Amount"), "10");
  await actor.type(screen.getByLabelText("Description"), "Dinner");
  await choose(actor, "Visibility", "Private");
  await actor.click(screen.getByRole("checkbox", { name: "Mo" }));
  await choose(actor, "Visibility", "Shared");
  await actor.click(screen.getByRole("button", { name: "Save expense" }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      "/houses/home/expenses",
      expect.objectContaining({ method: "POST" }),
    ),
  );
  const body = vi
    .mocked(api)
    .mock.calls.find(([, init]) => init?.method === "POST")![1]!.body as string;
  expect(JSON.parse(body)).toMatchObject({
    visibility: "shared",
    visible_to: [],
  });
});
it("ignores late mutation completion after a house switch", async () => {
  let resolveSave!: (value: unknown) => void;
  vi.mocked(api).mockImplementation((path, options) =>
    options?.method === "POST"
      ? new Promise((resolve) => {
          resolveSave = resolve;
        })
      : Promise.resolve(defaults(path, options)),
  );
  const actor = userEvent.setup();
  const view = show(Notes);
  await actor.type(screen.getByLabelText("Title"), "Old draft");
  await actor.type(screen.getByLabelText("Content"), "Old content");
  await actor.click(screen.getByRole("button", { name: "Save note" }));
  expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  view.rerender(
    <PreferencesProvider>
      <Notes {...props} houseId="new" />
    </PreferencesProvider>,
  );
  await act(async () => {
    resolveSave(note);
  });
  expect(screen.getByLabelText("Title")).toHaveValue("");
  expect(props.onChanged).not.toHaveBeenCalled();
});
it("preserves a note edit after unauthorized saving and notifies the controller", async () => {
  vi.mocked(api).mockImplementation(async (path, options) => {
    if (options?.method === "PUT") throw new ApiError(401, "Sign in again");
    return defaults(path, options);
  });
  const actor = userEvent.setup();
  show(Notes);
  await actor.click(await screen.findByRole("button", { name: "Edit" }));
  const dialog = await screen.findByRole("dialog");
  await actor.clear(within(dialog).getByLabelText("Content"));
  await actor.type(within(dialog).getByLabelText("Content"), "Unsaved edit");
  await actor.click(
    within(dialog).getByRole("button", { name: "Save changes" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Sign in again");
  expect(within(dialog).getByLabelText("Content")).toHaveValue("Unsaved edit");
  expect(props.onUnauthorized).toHaveBeenCalledTimes(1);
});
it("rejects blank note edits without losing the draft", async () => {
  const actor = userEvent.setup();
  show(Notes);
  await actor.click(await screen.findByRole("button", { name: "Edit" }));
  const dialog = await screen.findByRole("dialog");
  await actor.clear(within(dialog).getByLabelText("Title"));
  await actor.type(within(dialog).getByLabelText("Title"), " ");
  await actor.click(
    within(dialog).getByRole("button", { name: "Save changes" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Title and content are required",
  );
  expect(within(dialog).getByLabelText("Content")).toHaveValue("Clean up");
  expect(
    vi.mocked(api).mock.calls.some(([, init]) => init?.method === "PUT"),
  ).toBe(false);
});
it("recovers balances with retry after a failed request", async () => {
  let failed = true;
  vi.mocked(api).mockImplementation(async (path, options) => {
    if (failed) throw new ApiError(503, "Offline");
    return defaults(path, options);
  });
  const actor = userEvent.setup();
  show(Balances);
  expect(await screen.findByRole("alert")).toHaveTextContent("Offline");
  failed = false;
  await actor.click(screen.getByRole("button", { name: "Retry" }));
  expect(
    await screen.findByRole("heading", { name: "Alex" }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("uses the selected language and currency for finances", async () => {
  localStorage.setItem(
    "roomies.web.preferences",
    JSON.stringify({ language: "pt", currency: "BRL" }),
  );
  show(Balances);
  const cards = await screen.findAllByRole("article");
  expect(cards[0]).toHaveTextContent("Pagou R$");
  expect(cards[0]).toHaveTextContent("deve R$");
  expect(cards[0]).toHaveTextContent("líquido R$");
  expect(screen.getByText(/Bea paga Alex R\$/)).toBeInTheDocument();
});
it("preserves an unsaved expense draft while reviewing visibility settings", async () => {
  const actor = userEvent.setup();
  show(Expenses);
  await actor.click(
    await screen.findByRole("button", { name: "Details / edit" }),
  );
  const dialog = await screen.findByRole("dialog");
  await actor.clear(within(dialog).getByLabelText("Description"));
  await actor.type(
    within(dialog).getByLabelText("Description"),
    "Unsaved groceries",
  );
  await actor.click(
    within(dialog).getByRole("button", { name: "Change visibility" }),
  );
  await actor.click(
    within(dialog).getByRole("button", { name: "Back to expense" }),
  );
  expect(within(dialog).getByLabelText("Description")).toHaveValue(
    "Unsaved groceries",
  );
});
it("preserves selected recipients after a failed visibility change", async () => {
  vi.mocked(api).mockImplementation(async (path, options) => {
    if (path.endsWith("/visibility")) throw new ApiError(403, "Sharing denied");
    return defaults(path, options);
  });
  const actor = userEvent.setup();
  show(Expenses);
  await actor.click(
    await screen.findByRole("button", { name: "Details / edit" }),
  );
  await actor.click(
    await screen.findByRole("button", { name: "Change visibility" }),
  );
  await choose(actor, "Visibility", "Private");
  await actor.click(screen.getByRole("checkbox", { name: "Bea" }));
  await actor.click(screen.getByRole("button", { name: "Save visibility" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Sharing denied");
  expect(screen.getByRole("checkbox", { name: "Bea" })).toBeChecked();
  expect(props.onChanged).not.toHaveBeenCalled();
});
it("removes editing controls immediately when a role becomes monitor", async () => {
  const actor = userEvent.setup();
  const view = show(Expenses);
  await actor.click(
    await screen.findByRole("button", { name: "Details / edit" }),
  );
  expect(
    await screen.findByRole("button", { name: "Save changes" }),
  ).toBeInTheDocument();
  view.rerender(
    <PreferencesProvider>
      <Expenses {...props} role="monitor" />
    </PreferencesProvider>,
  );
  expect(
    screen.queryByRole("button", { name: "Save changes" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Change visibility" }),
  ).not.toBeInTheDocument();
  await actor.click(
    screen.getByText("Current splits", { selector: "summary" }),
  );
  expect(
    screen.getByRole("table", { name: "Current splits" }),
  ).toBeInTheDocument();
});

it("shows an absolute personal balance with a clear debt label", async () => {
  render(<PreferencesProvider><Balances {...props} user={{ id: "bea", name: "Bea", email: "bea@example.com" }} /></PreferencesProvider>);
  const balance = await screen.findByRole("region", { name: "Your balance" });
  expect(balance).toHaveTextContent("$5.00");
  expect(balance).toHaveTextContent("You owe");
  expect(balance).not.toHaveTextContent("-$5.00");
});
