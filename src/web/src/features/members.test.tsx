import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Members } from "./members";
import { api, ApiError } from "@/lib/api";
import { PreferencesProvider } from "@/lib/preferences";
import type { FeatureProps } from "@/lib/features";
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const props: FeatureProps = {
  houseId: "home",
  user: { id: "me", name: "Alex", email: "a@example.com" },
  role: "admin",
  members: [
    { user_id: "me", user_name: "Alex", role: "admin" },
    { user_id: "other", user_name: "Sam", role: "member" },
  ],
  onUnauthorized: vi.fn(),
  onChanged: vi.fn(),
};
it("hides invitation and role controls from non-admins", () => {
  render(
    <PreferencesProvider>
      <Members {...props} role="member" />
    </PreferencesProvider>,
  );
  expect(
    screen.queryByRole("button", { name: "Send invitation" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Remove" }),
  ).not.toBeInTheDocument();
  expect(api).not.toHaveBeenCalled();
});
it("shows one-use invitation links without persisting them", async () => {
  vi.mocked(api)
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce({
      id: "invite",
      manual_acceptance_url:
        "https://home.example/accept-invitation?token=private-token",
    })
    .mockResolvedValueOnce([]);
  render(
    <PreferencesProvider>
      <Members {...props} />
    </PreferencesProvider>,
  );
  await screen.findByText("No invitations yet.");
  await userEvent.type(screen.getByLabelText("Email"), "sam@example.com");
  await userEvent.click(
    screen.getByRole("button", { name: "Send invitation" }),
  );
  expect(await screen.findByLabelText("Invitation link")).toHaveValue(
    "https://home.example/accept-invitation?token=private-token",
  );
  expect(api).toHaveBeenCalledWith("/houses/home/invites", {
    method: "POST",
    body: JSON.stringify({ email: "sam@example.com", role: "member" }),
  });
  expect(JSON.stringify(localStorage)).not.toContain("private-token");
});
it("requires confirmation and surfaces a rejected last-admin removal", async () => {
  vi.mocked(api)
    .mockResolvedValueOnce([])
    .mockRejectedValueOnce(new ApiError(409, "cannot remove the last admin"));
  render(
    <PreferencesProvider>
      <Members {...props} />
    </PreferencesProvider>,
  );
  await screen.findByText("No invitations yet.");
  await userEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);
  expect(api).not.toHaveBeenCalledWith(
    "/houses/home/members/me",
    expect.anything(),
  );
  const dialog = screen.getByRole("alertdialog");
  await userEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
  await waitFor(() =>
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "cannot remove the last admin",
    ),
  );
  expect(props.onChanged).not.toHaveBeenCalled();
});
