import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { DashboardAutomations } from "./dashboard-automations";
import { PreferencesProvider } from "@/lib/preferences";
import { api, ApiError } from "@/lib/api";
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const props = {
  houseId: "home",
  writable: true,
  events: [],
  refresh: vi.fn(),
  navigate: vi.fn(),
  onUnauthorized: vi.fn(),
};
it("creates a bounded recurring reminder through the existing worker API and preserves fields after failure", async () => {
  vi.mocked(api)
    .mockRejectedValueOnce(new ApiError(500, "Try again"))
    .mockResolvedValueOnce({});
  render(
    <PreferencesProvider>
      <DashboardAutomations {...props} />
    </PreferencesProvider>,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "New recurring reminder" }),
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Reminder title" }), {
    target: { value: "Bins" },
  });
  fireEvent.change(screen.getByLabelText("First occurrence"), {
    target: { value: "2026-12-01T18:00" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Timezone" }), {
    target: { value: "UTC" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create reminder" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Try again");
  expect(screen.getByRole("textbox", { name: "Reminder title" })).toHaveValue(
    "Bins",
  );
  fireEvent.click(screen.getByRole("button", { name: "Create reminder" }));
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Recurring reminder created.",
  );
  expect(api).toHaveBeenLastCalledWith("/houses/home/scheduled-events", {
    method: "POST",
    body: JSON.stringify({
      title: "Bins",
      timezone: "UTC",
      dtstart_local: "2026-12-01T18:00:00",
      rrule: "FREQ=WEEKLY;INTERVAL=1;COUNT=12",
      exdates: [],
      enabled: true,
    }),
  });
  await waitFor(() => expect(props.refresh).toHaveBeenCalledOnce());
});
it("keeps creation unavailable for read-only members", () => {
  render(
    <PreferencesProvider>
      <DashboardAutomations {...props} writable={false} />
    </PreferencesProvider>,
  );
  expect(
    screen.queryByRole("button", { name: "New recurring reminder" }),
  ).not.toBeInTheDocument();
});

it("explains the UTF-8 title limit before sending a reminder", async () => {
  render(
    <PreferencesProvider>
      <DashboardAutomations {...props} />
    </PreferencesProvider>,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "New recurring reminder" }),
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Reminder title" }), {
    target: { value: "é".repeat(61) },
  });
  fireEvent.change(screen.getByLabelText("First occurrence"), {
    target: { value: "2026-12-01T18:00" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create reminder" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("120 UTF-8 bytes");
  expect(api).not.toHaveBeenCalled();
});
