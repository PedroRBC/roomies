import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { Dashboard } from "./dashboard";
import { MoneyInsights } from "./money-insights";
import { api } from "@/lib/api";
import { PreferencesProvider } from "@/lib/preferences";
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.useRealTimers();
});
const houses = [
  { id: "one", name: "First home" },
  { id: "two", name: "Second home" },
];
const props = {
  houses,
  user: { id: "me", name: "Alex", email: "a@example.com" },
  onSelect: vi.fn(),
  onCreate: vi.fn(),
  navigate: vi.fn(),
  onUnauthorized: vi.fn(),
};
it("shows upcoming entries and keeps financial charts out of Today", async () => {
  const month = new Date().toLocaleDateString("en-CA").slice(0, 7);
  vi.mocked(api).mockImplementation(async (path) => {
    if (path.endsWith("/expenses"))
      return [
        { id: "a", amount: 0.1, date: `${month}-01` },
        { id: "b", amount: 0.2, date: `${month}-02` },
        { id: "old", amount: 10, date: "2000-01-01" },
      ];
    if (path.endsWith("/agenda"))
      return {
        entries: [
          {
            id: "chore",
            title: "Kitchen reset",
            kind: "chore",
            when: "2099-12-01T17:00:00Z",
            timezone: "UTC",
            all_day: false,
          },
          {
            id: "calendar",
            title: "House meeting",
            kind: "calendar",
            when: "2099-12-01T18:00:00Z",
            timezone: "UTC",
            all_day: false,
          },
        ],
        truncated: false,
      };
    if (path.endsWith("/scheduled-events"))
      return [
        {
          id: "movie",
          title: "Movie night",
          enabled: true,
          next_occurrence_at: "2099-12-01T19:00:00Z",
        },
        { id: "off", title: "Disabled reminder", enabled: false },
      ];
    return [];
  });
  render(
    <PreferencesProvider>
      <Dashboard {...props} selected="one" />
    </PreferencesProvider>,
  );
  expect(await screen.findByText("Kitchen reset")).toBeInTheDocument();
  expect(screen.getByText("House meeting")).toBeInTheDocument();
  expect(screen.getAllByText("Movie night").length).toBeGreaterThan(0);
  expect(screen.queryByText("Who paid")).not.toBeInTheDocument();
  expect(screen.queryByText("Spending by day")).not.toBeInTheDocument();
  expect(screen.queryByText("Disabled reminder")).not.toBeInTheDocument();
});
it.each([
  ["2025-02", 28],
  ["2024-02", 29],
  ["2026-04", 30],
  ["2026-01", 31],
] as const)(
  "keeps separate daily spending totals for %s's %i days",
  async (month, days) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${month}-${days}T12:00:00`));
    vi.mocked(api).mockImplementation(async (path) =>
      path.endsWith("/expenses")
        ? [
            {
              id: "a",
              description: "First groceries",
              amount: 0.1,
              date: `${month}-01`,
              payer_name: "Alex",
              category: "food",
            },
            {
              id: "b",
              description: "Second groceries",
              amount: 0.2,
              date: `${month}-01`,
              payer_name: "Alex",
              category: "food",
            },
            {
              id: "c",
              description: "Bus fare",
              amount: 0.4,
              date: `${month}-07`,
              payer_name: "Alex",
              category: "transport",
            },
          ]
        : [],
    );
    render(
      <PreferencesProvider>
        <MoneyInsights
          houseId="one"
          user={props.user}
          role="admin"
          members={[]}
          onUnauthorized={props.onUnauthorized}
          navigate={props.navigate}
        />
      </PreferencesProvider>,
    );
    const table = await screen.findByRole("table", {
      name: "Spending by day",
      hidden: true,
    });
    expect(within(table).getAllByRole("row", { hidden: true })).toHaveLength(
      days + 1,
    );
    expect(
      within(table).getByText(`${month}-01`).closest("tr"),
    ).toHaveTextContent("$0.30");
    expect(
      within(table).getByText(`${month}-07`).closest("tr"),
    ).toHaveTextContent("$0.40");
    expect(
      within(table).getByText(`${month}-${days}`).closest("tr"),
    ).toHaveTextContent("$0.00");
  },
);
it("previews the first three monthly expenses with their amounts", async () => {
  const month = new Date().toLocaleDateString("en-CA").slice(0, 7);
  vi.mocked(api).mockImplementation(async (path) =>
    path.endsWith("/expenses")
      ? [
          {
            id: "old",
            description: "Old expense",
            amount: 90,
            date: "2000-01-01",
            payer_name: "Alex",
            category: "other",
          },
          {
            id: "a",
            description: "Groceries",
            amount: 12.34,
            date: `${month}-07`,
            payer_name: "Alex",
            category: "food",
          },
          {
            id: "b",
            description: "Electricity",
            amount: 23.45,
            date: `${month}-06`,
            payer_name: "Alex",
            category: "utilities",
          },
          {
            id: "c",
            description: "Cleaning",
            amount: 34.56,
            date: `${month}-05`,
            payer_name: "Alex",
            category: "other",
          },
          {
            id: "d",
            description: "Fourth expense",
            amount: 45.67,
            date: `${month}-04`,
            payer_name: "Alex",
            category: "other",
          },
        ]
      : [],
  );
  render(
    <PreferencesProvider>
      <MoneyInsights
        houseId="one"
        user={props.user}
        role="admin"
        members={[]}
        onUnauthorized={props.onUnauthorized}
        navigate={props.navigate}
      />
    </PreferencesProvider>,
  );
  const recent = await screen.findByRole("list", { name: "Recent expenses" });
  expect(within(recent).getAllByRole("listitem")).toHaveLength(3);
  for (const [description, amount] of [
    ["Groceries", "$12.34"],
    ["Electricity", "$23.45"],
    ["Cleaning", "$34.56"],
  ]) {
    expect(
      within(recent).getByText(description).closest("li"),
    ).toHaveTextContent(amount);
  }
  expect(screen.queryByText("Old expense")).not.toBeInTheDocument();
  expect(screen.queryByText("Fourth expense")).not.toBeInTheDocument();
});
it("opens the create-house form from an initial dashboard deep link with existing houses", () => {
  vi.mocked(api).mockResolvedValue([]);
  render(
    <PreferencesProvider>
      <Dashboard {...props} selected="one" createRequested />
    </PreferencesProvider>,
  );
  expect(
    screen.getByRole("textbox", { name: "House name" }),
  ).toBeInTheDocument();
});
it("opens the create-house form when navigation requests it again", () => {
  vi.mocked(api).mockResolvedValue([]);
  const dashboard = (createRequested: boolean) => (
    <PreferencesProvider>
      <Dashboard {...props} selected="one" createRequested={createRequested} />
    </PreferencesProvider>
  );
  const view = render(dashboard(false));
  expect(
    screen.queryByRole("textbox", { name: "House name" }),
  ).not.toBeInTheDocument();
  view.rerender(dashboard(true));
  expect(
    screen.getByRole("textbox", { name: "House name" }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(
    screen.queryByRole("textbox", { name: "House name" }),
  ).not.toBeInTheDocument();
  expect(props.navigate).toHaveBeenCalledWith("/dashboard");
  view.rerender(dashboard(false));
  view.rerender(dashboard(true));
  expect(
    screen.getByRole("textbox", { name: "House name" }),
  ).toBeInTheDocument();
});
it("clears the create-house query after creating a house", async () => {
  vi.mocked(api).mockResolvedValue([]);
  render(
    <PreferencesProvider>
      <Dashboard {...props} selected="one" createRequested />
    </PreferencesProvider>,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "House name" }), {
    target: { value: "Third home" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create house" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("textbox", { name: "House name" }),
    ).not.toBeInTheDocument(),
  );
  expect(props.navigate).toHaveBeenCalledWith("/dashboard");
});
it("does not show a late private summary after changing the focused house", async () => {
  let finish!: (value: unknown) => void;
  const delayed = new Promise((resolve) => {
    finish = resolve;
  });
  vi.mocked(api).mockImplementation(async (path) =>
    path === "/houses/one/notes" ? delayed : [],
  );
  const view = render(
    <PreferencesProvider>
      <Dashboard {...props} selected="one" />
    </PreferencesProvider>,
  );
  view.rerender(
    <PreferencesProvider>
      <Dashboard {...props} selected="two" />
    </PreferencesProvider>,
  );
  await screen.findByText("No notes yet.");
  finish([
    { id: "private", title: "Private old note", content: "Should stay hidden" },
  ]);
  await waitFor(() =>
    expect(screen.queryByText("Private old note")).not.toBeInTheDocument(),
  );
});

it("selects a note with the carousel indicators and opens the house notes", async () => {
  vi.mocked(api).mockImplementation(async (path) =>
    path.endsWith("/notes")
      ? [
          { id: "first", title: "First note", content: "First content" },
          { id: "second", title: "Second note", content: "Second content" },
        ]
      : [],
  );
  render(
    <PreferencesProvider>
      <Dashboard {...props} selected="one" />
    </PreferencesProvider>,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Open note 2: Second note" }),
  );
  expect(
    screen.getByRole("heading", { name: "Second note" }),
  ).toBeInTheDocument();
  expect(screen.queryByText("First content")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Open notes" }));
  expect(
    await screen.findByRole("dialog", { name: "Quick workspace" }),
  ).toBeInTheDocument();
  expect(props.navigate).not.toHaveBeenCalled();
});

it("keeps Today actions visible when optional resources fail and retries", async () => {
  const month = new Date().toLocaleDateString("en-CA").slice(0, 7);
  let failing = true;
  vi.mocked(api).mockImplementation(async (path) => {
    if (path.endsWith("/expenses"))
      return [{ id: "a", description: "Food", amount: 1, date: `${month}-01` }];
    if (
      failing &&
      (path.endsWith("/notes") ||
        path.endsWith("/scheduled-events") ||
        path.endsWith("/groceries"))
    )
      throw new Error("Unavailable");
    return [];
  });
  render(
    <PreferencesProvider>
      <Dashboard {...props} selected="one" />
    </PreferencesProvider>,
  );
  expect(
    await screen.findByRole("button", { name: "Add expense" }),
  ).toBeInTheDocument();
  expect(
    screen.getByText("Notes unavailable. Refresh to retry."),
  ).toBeInTheDocument();
  expect(
    screen.getByText("Reminders unavailable. Refresh to retry."),
  ).toBeInTheDocument();
  failing = false;
  fireEvent.click(screen.getByRole("button", { name: "Refresh dashboard" }));
  expect(await screen.findByText("No notes yet.")).toBeInTheDocument();
});

it("preserves an open reminder draft across failed background refreshes", async () => {
  let failing = false;
  vi.mocked(api).mockImplementation(async (path) => {
    if (
      failing &&
      (path.endsWith("/expenses") || path.endsWith("/scheduled-events"))
    )
      throw new Error("Unavailable");
    if (path.endsWith("/members"))
      return [{ user_id: "me", user_name: "Alex", role: "admin" }];
    return [];
  });
  render(
    <PreferencesProvider>
      <Dashboard {...props} selected="one" />
    </PreferencesProvider>,
  );
  fireEvent.click(await screen.findByText("Reminders & automations"));
  fireEvent.click(
    await screen.findByRole("button", { name: "New recurring reminder" }),
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Reminder title" }), {
    target: { value: "Keep this draft" },
  });
  failing = true;
  fireEvent.click(screen.getByRole("button", { name: "Refresh dashboard" }));
  await screen.findByText(/Some data could not be refreshed/);
  expect(screen.getByRole("textbox", { name: "Reminder title" })).toHaveValue(
    "Keep this draft",
  );
});

it("opens a ready expense composer without leaving Today and focuses inline shopping", async () => {
  vi.mocked(api).mockImplementation(async (path) =>
    path.endsWith("/members")
      ? [{ user_id: "me", user_name: "Alex", role: "admin" }]
      : path === "/houses/one"
        ? { id: "one", name: "First home" }
        : [],
  );
  render(
    <PreferencesProvider>
      <Dashboard {...props} selected="one" />
    </PreferencesProvider>,
  );
  const shopping = await screen.findByRole("textbox", { name: "Name" });
  fireEvent.click(screen.getByRole("button", { name: "Add shopping item" }));
  expect(shopping).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Add expense" }));
  const drawer = await screen.findByRole("dialog", { name: "Quick workspace" });
  expect(
    await within(drawer).findByRole("textbox", { name: "Amount" }),
  ).toBeVisible();
  expect(props.navigate).not.toHaveBeenCalled();
});
it("keeps creation actions unavailable for a read-only house member", async () => {
  vi.mocked(api).mockImplementation(async (path) =>
    path.endsWith("/members")
      ? [{ user_id: "me", user_name: "Alex", role: "monitor" }]
      : [],
  );
  render(
    <PreferencesProvider>
      <Dashboard {...props} selected="one" />
    </PreferencesProvider>,
  );
  await screen.findByText("No notes yet.");
  expect(screen.getByRole("button", { name: "Add expense" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Write a note" })).toBeDisabled();
});

it("shows an interactive spending area chart in Money", async () => {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  vi.mocked(api).mockImplementation(async (path) =>
    path.endsWith("/expenses")
      ? [
          {
            id: "recent",
            description: "Groceries",
            amount: 32.5,
            date: today,
            visibility: "shared",
          },
          {
            id: "private",
            description: "Private",
            amount: 90,
            date: tomorrow,
            visibility: "private",
          },
        ]
      : [],
  );
  render(
    <PreferencesProvider>
      <MoneyInsights
        houseId="one"
        user={props.user}
        role="admin"
        members={[]}
        onUnauthorized={props.onUnauthorized}
        navigate={props.navigate}
      />
    </PreferencesProvider>,
  );
  expect(await screen.findByText("Spending over time")).toBeInTheDocument();
  expect(
    screen.getByRole("combobox", { name: "Spending range" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("img", { name: "Shared spending over time" }),
  ).toBeInTheDocument();
});
