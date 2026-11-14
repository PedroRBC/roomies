import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { clearInvitation } from "@/features/invitation-state";
import { api, ApiError } from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: vi.fn(),
}));
afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  clearInvitation();
  vi.resetAllMocks();
  window.history.replaceState(null, "", "/");
});
const user = { id: "me", name: "Alex", email: "a@example.com" };

it("signs in with cookies and creates a first house", async () => {
  vi.mocked(api).mockImplementation(async (path, options) => {
    if (path === "/auth/config") return { password: true, google: false };
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
  await actor.click(
    within(screen.getByLabelText("House name").closest("form")!).getByRole(
      "button",
      { name: "Create house" },
    ),
  );
  expect(
    await screen.findByRole("combobox", { name: "Your house" }),
  ).toHaveTextContent("Our home");
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

it.each([
  new Error("Network unavailable"),
  new ApiError(500, "Logout unavailable"),
])(
  "keeps the session available to retry logout when revocation fails: %s",
  async (failure) => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === "/auth/config") return { password: true, google: false };
      if (path === "/auth/me") return user;
      if (path === "/auth/logout") throw failure;
      return [];
    });
    const actor = userEvent.setup();
    render(<App />);
    await actor.click(await screen.findByRole("button", { name: "Settings" }));
    await actor.click(await screen.findByRole("button", { name: "Sign out" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(failure.message),
    );
    expect(
      screen.getByRole("button", { name: "Sign out" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  },
);

it("opens create-house from the shared switcher", async () => {
  window.history.replaceState(null, "", "/dashboard");
  vi.mocked(api).mockImplementation(async (path) => {
    if (path === "/auth/config") return { password: true, google: false };
    if (path === "/auth/me") return user;
    if (path === "/houses") return [{ id: "one", name: "Our home" }];
    return [];
  });
  const actor = userEvent.setup();
  render(<App />);
  await actor.click(
    await screen.findByRole("combobox", { name: "Your house" }),
  );
  await actor.click(
    await screen.findByRole("option", { name: "Create house" }),
  );
  expect(await screen.findByLabelText("House name")).toBeInTheDocument();
  expect(window.location.search).toBe("?create=1");
});

it("groups household destinations and manages members without leaving the current location", async () => {
  vi.mocked(api).mockImplementation(async (path) => {
    if (path === "/auth/config") return { password: true, google: false };
    if (path === "/auth/me") return user;
    if (path === "/houses") return [{ id: "one", name: "Our home" }];
    if (path === "/houses/one") return { id: "one", name: "Our home" };
    if (path.endsWith("/members"))
      return [{ user_id: "me", user_name: "Alex", role: "admin" }];
    return [];
  });
  const actor = userEvent.setup();
  render(<App />);
  await actor.click(await screen.findByRole("button", { name: "Household" }));
  await actor.click(await screen.findByRole("button", { name: "Noticeboard" }));
  expect(window.location.pathname).toBe("/house/one");
  expect(window.location.search).toBe("?tab=notes");
  await actor.click(screen.getByRole("button", { name: "House members" }));
  expect(
    await screen.findByRole("dialog", { name: "House members" }),
  ).toBeInTheDocument();
  expect(window.location.search).toBe("?tab=notes");
});

it("keeps Google and authenticator security available with the new settings route", async () => {
  vi.mocked(api).mockImplementation(async (path) => {
    if (path === "/auth/config") return { password: true, google: true };
    if (path === "/auth/me") throw new ApiError(401, "unauthorized");
    return [];
  });
  const view = render(<App />);
  expect(
    await screen.findByRole("button", { name: "Continue with Google" }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Password")).toBeInTheDocument();
  view.unmount();
  window.history.replaceState(null, "", "/settings");
  vi.mocked(api).mockImplementation(async (path) =>
    path === "/auth/me" ? { ...user, two_factor_enabled: true } : [],
  );
  render(<App />);
  expect(
    await screen.findByRole("button", {
      name: "Disable two-factor authentication",
    }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Authenticator code")).toBeInTheDocument();
});

it("uses the registration route and returns to password sign-in", async () => {
  vi.mocked(api).mockImplementation(async (path) => {
    if (path === "/auth/config") return { google: false };
    throw new ApiError(401, "unauthorized");
  });
  const actor = userEvent.setup();
  render(<App />);
  await actor.click(
    await screen.findByRole("button", { name: "Create an account" }),
  );
  expect(window.location.pathname).toBe("/register");
  expect(screen.getByLabelText("Your name")).toBeInTheDocument();
  await actor.click(
    screen.getByRole("button", { name: "Already have an account? Sign in" }),
  );
  expect(window.location.pathname).toBe("/");
  expect(screen.queryByLabelText("Your name")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Password")).toBeInTheDocument();
});

it("resumes a pending invitation only after the authenticator challenge succeeds", async () => {
  window.history.replaceState(
    null,
    "",
    "/accept-invitation?token=pending-invite",
  );
  vi.mocked(api).mockImplementation(async (path) => {
    if (path === "/auth/config") return { google: false };
    if (path === "/auth/me") throw new ApiError(401, "unauthorized");
    if (path === "/auth/login") return { two_factor_required: true };
    if (path === "/auth/two-factor/verify-totp") return { user };
    if (path === "/invitations/accept")
      return { invitation: { house_id: "invited-house" } };
    return [];
  });
  const actor = userEvent.setup();
  render(<App />);
  await actor.type(await screen.findByLabelText("Email"), "a@example.com");
  await actor.type(screen.getByLabelText("Password"), "password123");
  await actor.click(screen.getByRole("button", { name: "Sign in" }));
  expect(screen.getByLabelText("Authenticator code")).toBeInTheDocument();
  expect(
    vi.mocked(api).mock.calls.some(([path]) => path === "/invitations/accept"),
  ).toBe(false);
  await actor.type(screen.getByLabelText("Authenticator code"), "123456");
  await actor.click(screen.getByRole("button", { name: "Verify" }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/invitations/accept", {
      method: "POST",
      body: JSON.stringify({ token: "pending-invite" }),
    }),
  );
  await waitFor(() =>
    expect(window.location.pathname).toBe("/house/invited-house"),
  );
});
