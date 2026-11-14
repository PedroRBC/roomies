import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Dashboard } from "./dashboard";
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
it("shows exact monthly expense totals and upcoming enabled entries", async () => {
  const month = new Date().toLocaleDateString("en-CA").slice(0, 7);
  vi.mocked(api).mockImplementation(async (path) => {
    if (path.endsWith("/expenses"))
      return [
        { id: "a", amount: 0.1, date: `${month}-01` },
        { id: "b", amount: 0.2, date: `${month}-02` },
        { id: "old", amount: 10, date: "2000-01-01" },
      ];
    if (path.endsWith("/calendar"))
      return [{ title: "Movie night", start_local: "2026-12-01T19:00:00" }];
    if (path.endsWith("/chores"))
      return [
        {
          title: "Disabled chore",
          enabled: false,
          due_local: "2026-12-01T19:00:00",
        },
      ];
    return [];
  });
  render(
    <PreferencesProvider>
      <Dashboard {...props} selected="one" />
    </PreferencesProvider>,
  );
  expect(await screen.findByText("Movie night")).toBeInTheDocument();
  expect(screen.getAllByText("$0.30").length).toBeGreaterThan(0);
  expect(screen.queryByText("Disabled chore")).not.toBeInTheDocument();
});
it.each([
  ["2025-02", 28],
  ["2024-02", 29],
  ["2026-04", 30],
  ["2026-01", 31],
] as const)("keeps separate daily spending totals for %s's %i days", async (month, days) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${month}-15T12:00:00`));
  vi.mocked(api).mockImplementation(async (path) =>
    path.endsWith("/expenses")
      ? [
          { id: "a", description: "First groceries", amount: 0.1, date: `${month}-01`, payer_name: "Alex", category: "food" },
          { id: "b", description: "Second groceries", amount: 0.2, date: `${month}-01`, payer_name: "Alex", category: "food" },
          { id: "c", description: "Bus fare", amount: 0.4, date: `${month}-07`, payer_name: "Alex", category: "transport" },
        ]
      : [],
  );
  render(
    <PreferencesProvider>
      <Dashboard {...props} selected="one" />
    </PreferencesProvider>,
  );
  const graph = await screen.findByRole("img", { name: "Spending by day" });
  expect(within(graph).getAllByTitle(/^Day /)).toHaveLength(days);
  expect(within(graph).getByTitle("Day 1: $0.30")).toBeInTheDocument();
  expect(within(graph).getByTitle("Day 7: $0.40")).toBeInTheDocument();
  expect(within(graph).getByTitle(`Day ${days}: $0.00`)).toBeInTheDocument();
});
it("previews the first three monthly expenses with their amounts", async () => {
  const month = new Date().toLocaleDateString("en-CA").slice(0, 7);
  vi.mocked(api).mockImplementation(async (path) =>
    path.endsWith("/expenses")
      ? [
          { id: "old", description: "Old expense", amount: 90, date: "2000-01-01", payer_name: "Alex", category: "other" },
          { id: "a", description: "Groceries", amount: 12.34, date: `${month}-07`, payer_name: "Alex", category: "food" },
          { id: "b", description: "Electricity", amount: 23.45, date: `${month}-06`, payer_name: "Alex", category: "utilities" },
          { id: "c", description: "Cleaning", amount: 34.56, date: `${month}-05`, payer_name: "Alex", category: "other" },
          { id: "d", description: "Fourth expense", amount: 45.67, date: `${month}-04`, payer_name: "Alex", category: "other" },
        ]
      : [],
  );
  render(
    <PreferencesProvider>
      <Dashboard {...props} selected="one" />
    </PreferencesProvider>,
  );
  const recent = await screen.findByRole("list", { name: "Recent expenses" });
  expect(within(recent).getAllByRole("listitem")).toHaveLength(3);
  for (const [description, amount] of [["Groceries", "$12.34"], ["Electricity", "$23.45"], ["Cleaning", "$34.56"]]) {
    expect(within(recent).getByText(description).closest("li")).toHaveTextContent(amount);
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
  expect(screen.getByRole("textbox", { name: "House name" })).toBeInTheDocument();
});
it("opens the create-house form when navigation requests it again", () => {
  vi.mocked(api).mockResolvedValue([]);
  const dashboard = (createRequested: boolean) => (
    <PreferencesProvider>
      <Dashboard {...props} selected="one" createRequested={createRequested} />
    </PreferencesProvider>
  );
  const view = render(dashboard(false));
  expect(screen.queryByRole("textbox", { name: "House name" })).not.toBeInTheDocument();
  view.rerender(dashboard(true));
  expect(screen.getByRole("textbox", { name: "House name" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("textbox", { name: "House name" })).not.toBeInTheDocument();
  expect(props.navigate).toHaveBeenCalledWith("/dashboard");
  view.rerender(dashboard(false));
  view.rerender(dashboard(true));
  expect(screen.getByRole("textbox", { name: "House name" })).toBeInTheDocument();
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
    expect(screen.queryByRole("textbox", { name: "House name" })).not.toBeInTheDocument(),
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
