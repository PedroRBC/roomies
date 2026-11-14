import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { HouseWorkspace } from "./house-workspace";
import { PreferencesProvider } from "@/lib/preferences";
import { api, ApiError } from "@/lib/api";
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: vi.fn(),
}));
vi.mock("@/features/expenses", () => ({
  Expenses: ({ houseId, role }: { houseId: string; role: string | null }) => (
    <div>
      Expenses for {houseId}: {role}
    </div>
  ),
}));
vi.mock("@/features/notes", () => ({ Notes: () => <div>Notes section</div> }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const user = { id: "me", name: "Alex", email: "a@example.com" };
const onUnauthorized = vi.fn();
function workspace(id = "one", tab: "expenses" | "notes" = "expenses") {
  return (
    <PreferencesProvider>
      <HouseWorkspace
        key={id}
        house={{ id, name: id }}
        user={user}
        tab={tab}
        onUnauthorized={onUnauthorized}
      />
    </PreferencesProvider>
  );
}
function respond() {
  vi.mocked(api).mockImplementation(async (path) =>
    path.endsWith("/members")
      ? [{ user_id: "me", user_name: "Alex", role: "monitor" }]
      : { id: path.split("/").at(-1), name: "Our home" },
  );
}
it("loads membership and passes the correct read-only role to the active feature", async () => {
  respond();
  render(workspace());
  expect(
    await screen.findByText("Expenses for one: monitor"),
  ).toBeInTheDocument();
});
it("uses the active route section", async () => {
  respond();
  render(workspace("one", "notes"));
  expect(await screen.findByText("Notes section")).toBeInTheDocument();
  expect(screen.queryByText(/Expenses for/)).not.toBeInTheDocument();
});
it("does not render responses from a house after switching houses", async () => {
  let finish!: (value: unknown) => void;
  const old = new Promise((resolve) => {
    finish = resolve;
  });
  respond();
  const normal = vi.mocked(api).getMockImplementation()!;
  vi.mocked(api).mockImplementation((path, options) =>
    path === "/houses/one"
      ? (old as ReturnType<typeof api>)
      : normal(path, options),
  );
  const view = render(workspace());
  view.rerender(workspace("two"));
  await screen.findByText("Expenses for two: monitor");
  finish({ id: "one", name: "Old private house" });
  await waitFor(() =>
    expect(screen.queryByText("Old private house")).not.toBeInTheDocument(),
  );
});
it("returns to sign-in on expired membership sessions", async () => {
  vi.mocked(api).mockRejectedValue(new ApiError(401, "unauthorized"));
  render(workspace());
  await waitFor(() => expect(onUnauthorized).toHaveBeenCalledOnce());
});
