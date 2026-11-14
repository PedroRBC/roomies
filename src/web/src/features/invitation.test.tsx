import { StrictMode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { PreferencesProvider } from "@/lib/preferences";
import { api, ApiError } from "@/lib/api";
import { AcceptInvitation } from "./invitation";
import { captureInvitation, hasPendingInvitation } from "./invitation-state";
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});
function capture() {
  window.history.replaceState(
    null,
    "",
    "/accept-invitation?token=private-invite",
  );
  captureInvitation();
}
it("removes the bearer token from the URL and consumes it only once in StrictMode", async () => {
  capture();
  expect(window.location.search).toBe("");
  expect(hasPendingInvitation()).toBe(true);
  vi.mocked(api).mockResolvedValue({ invitation: { house_id: "joined" } });
  const onJoined = vi.fn();
  render(
    <StrictMode>
      <PreferencesProvider>
        <AcceptInvitation onJoined={onJoined} onUnauthorized={vi.fn()} />
      </PreferencesProvider>
    </StrictMode>,
  );
  await waitFor(() => expect(onJoined).toHaveBeenCalledWith("joined"));
  expect(api).toHaveBeenCalledExactlyOnceWith("/invitations/accept", {
    method: "POST",
    body: JSON.stringify({ token: "private-invite" }),
  });
  expect(hasPendingInvitation()).toBe(false);
});
it("keeps a pending invitation after transient failure and supports retry", async () => {
  capture();
  vi.mocked(api)
    .mockRejectedValueOnce(new ApiError(503, "Try later"))
    .mockResolvedValueOnce({ invitation: { house_id: "joined" } });
  const onJoined = vi.fn();
  render(
    <PreferencesProvider>
      <AcceptInvitation onJoined={onJoined} onUnauthorized={vi.fn()} />
    </PreferencesProvider>,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Try later");
  expect(hasPendingInvitation()).toBe(true);
  await userEvent.click(
    screen.getByRole("button", { name: "Retry invitation" }),
  );
  await waitFor(() => expect(onJoined).toHaveBeenCalledOnce());
  expect(hasPendingInvitation()).toBe(false);
});
