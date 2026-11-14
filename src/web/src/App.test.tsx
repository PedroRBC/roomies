import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { api, ApiError } from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  window.history.replaceState(null, "", "/");
});
const user = { id: "me", name: "Alex", email: "a@example.com" };

it("signs in with cookies and creates a first house", async () => {
  vi.mocked(api).mockImplementation(async (path, options) => {
    if (path === "/auth/config") return { password: true, provider: "better-auth" };
    if (path === "/auth/me") throw new ApiError(401, "unauthorized");
    if (path === "/auth/login") return { user };
    if (path === "/houses")
      return options?.method === "POST"
        ? { id: "new-house", name: "Our home" }
        : [];
    if (path.endsWith("/members"))
      return [{ user_id: "me", user_name: "Alex", role: "owner" }];
    if (path.endsWith("/balances")) return { balances: [], settlements: [] };
    return [];
  });
  const actor = userEvent.setup();
  render(<App />);
  await actor.type(await screen.findByLabelText("Email"), "a@example.com");
  await actor.type(screen.getByLabelText("Password"), "password123");
  await actor.click(screen.getByRole("button", { name: "Sign in" }));
  await actor.type(await screen.findByLabelText("House name"), "Our home");
  await actor.click(screen.getByRole("button", { name: "Create house" }));
  expect(
    await screen.findByRole("heading", { name: "Our home" }),
  ).toBeInTheDocument();
  expect(api).toHaveBeenCalledWith("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "a@example.com", password: "password123" }),
  });
});

it("shows a recoverable startup error instead of an empty login screen", async () => {
  vi.mocked(api).mockRejectedValue(new ApiError(503, "Service unavailable"));
  render(<App />);
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("Service unavailable"),
  );
  expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
});
