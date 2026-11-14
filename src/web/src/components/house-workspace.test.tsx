import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HouseWorkspace } from "./house-workspace";
import { api, ApiError } from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const user = { id: "me", name: "Alex", email: "a@example.com" };
const onUnauthorized = vi.fn();
function respond(role = "member") {
  vi.mocked(api).mockImplementation(async (path) => {
    if (path.endsWith("/members"))
      return [{ user_id: "me", user_name: "Alex", role }];
    if (path.endsWith("/balances")) return { balances: [], settlements: [] };
    return [];
  });
}
function workspace(id = "one") {
  return (
    <HouseWorkspace
      key={id}
      house={{ id, name: id }}
      user={user}
      onUnauthorized={onUnauthorized}
    />
  );
}

it("retains expense input and shows validation errors when a save fails", async () => {
  respond();
  const actor = userEvent.setup();
  render(workspace());
  await actor.type(
    await screen.findByLabelText("What was it for?"),
    "Groceries",
  );
  await actor.type(screen.getByLabelText("Amount (USD)"), "12.34");
  vi.mocked(api).mockRejectedValueOnce(new ApiError(400, "invalid expense"));
  await actor.click(screen.getByRole("button", { name: "Add expense" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("invalid expense");
  expect(screen.getByLabelText("What was it for?")).toHaveValue("Groceries");
  expect(api).toHaveBeenCalledWith(
    "/houses/one/expenses",
    expect.objectContaining({
      method: "POST",
      body: expect.stringContaining('"amount":12.34'),
    }),
  );
});

it("keeps monitors read-only", async () => {
  respond("monitor");
  render(workspace());
  await screen.findByText(
    "No expenses yet. Add the first thing you paid for together.",
  );
  expect(
    screen.queryByRole("button", { name: "Add expense" }),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("tab", { name: "Notes" }));
  expect(
    screen.queryByRole("button", { name: "Add note" }),
  ).not.toBeInTheDocument();
});

it("never renders late responses from a house after switching houses", async () => {
  let finish!: (value: unknown) => void;
  const oldExpenses = new Promise((resolve) => {
    finish = resolve;
  });
  respond();
  const normal = vi.mocked(api).getMockImplementation()!;
  vi.mocked(api).mockImplementation((path, options) =>
    path === "/houses/one/expenses"
      ? (oldExpenses as ReturnType<typeof api>)
      : normal(path, options),
  );
  const view = render(workspace());
  view.rerender(workspace("two"));
  await screen.findByText(
    "No expenses yet. Add the first thing you paid for together.",
  );
  finish([
    {
      id: "old",
      description: "Private old house data",
      amount: 12,
      date: "2026-11-13",
      payer_name: "Alex",
    },
  ]);
  await waitFor(() =>
    expect(
      screen.queryByText("Private old house data"),
    ).not.toBeInTheDocument(),
  );
  expect(screen.getByRole("region", { name: "two" })).toBeInTheDocument();
});

it("returns to sign-in on an expired session", async () => {
  vi.mocked(api).mockRejectedValue(new ApiError(401, "unauthorized"));
  render(workspace());
  await waitFor(() => expect(onUnauthorized).toHaveBeenCalledOnce());
});
