import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { Settings } from "./settings";
import { PreferencesProvider } from "@/lib/preferences";
import { api, ApiError } from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: vi.fn(),
}));
const props = {
  user: { id: "me", name: "Alex", email: "alex@example.com" },
  houses: [{ id: "home", name: "Our house" }],
  onRefresh: vi.fn(),
  onUnauthorized: vi.fn(),
};
beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("keeps signed-out settings limited to device preferences", () => {
  render(
    <PreferencesProvider>
      <Settings {...props} user={null} />
    </PreferencesProvider>,
  );
  expect(screen.getByRole("group", { name: "Language" })).toBeInTheDocument();
  expect(
    screen.queryByRole("group", { name: "Your houses" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Dark" }));
  expect(document.documentElement).toHaveClass("dark");
  fireEvent.click(screen.getByRole("button", { name: "Plum" }));
  expect(document.documentElement).toHaveAttribute("data-accent", "plum");
  expect(api).not.toHaveBeenCalled();
});

it("selects a default house and preserves rename input on an authorization error", async () => {
  vi.mocked(api).mockRejectedValueOnce(new ApiError(401, "Sign in again"));
  render(
    <PreferencesProvider>
      <Settings {...props} />
    </PreferencesProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Our house" }));
  expect(
    JSON.parse(localStorage.getItem("roomies.web.preferences")!).defaultHouse,
  ).toBe("home");
  fireEvent.click(
    screen.getByRole("button", { name: "Rename house: Our house" }),
  );
  const dialog = screen.getByRole("dialog");
  fireEvent.change(
    within(dialog).getByRole("textbox", { name: "House name" }),
    { target: { value: "Renamed house" } },
  );
  fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(props.onUnauthorized).toHaveBeenCalled());
  expect(
    within(dialog).getByRole("textbox", { name: "House name" }),
  ).toHaveValue("Renamed house");
  expect(within(dialog).getByRole("alert")).toHaveTextContent("Sign in again");
  expect(props.onRefresh).not.toHaveBeenCalled();
});
