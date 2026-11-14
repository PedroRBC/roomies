import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PreferencesProvider } from "@/lib/preferences";
import type { FeatureProps } from "@/lib/features";
import { Notifications } from "./notifications";

const prefs = {
  house_id: "a",
  user_id: "me",
  expense_created_enabled: true,
  reminder_enabled: true,
  cadence: "immediate",
  timezone: "UTC",
  digest_minutes: 480,
};
const event = {
  id: "event",
  house_id: "a",
  creator_id: "me",
  title: "Rent",
  timezone: "Europe/Lisbon",
  dtstart_local: "2026-12-01T09:00:00",
  rrule: "FREQ=MONTHLY;INTERVAL=1;COUNT=3;BYMONTHDAY=1",
  exdates: [],
  enabled: false,
  next_occurrence_at: "2026-12-01T09:00:00Z",
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
};
const props: FeatureProps = {
  houseId: "a",
  user: { id: "me", name: "Me", email: "me@example.com" },
  role: "member",
  members: [],
  onUnauthorized: vi.fn(),
};
type Fetcher = (path: string, options?: RequestInit) => Promise<Response>;
let fetcher: ReturnType<typeof vi.fn<Fetcher>>;
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
function view(overrides: Partial<FeatureProps> = {}) {
  return (
    <PreferencesProvider>
      <Notifications {...props} {...overrides} />
    </PreferencesProvider>
  );
}
beforeEach(() => {
  localStorage.clear();
  fetcher = vi.fn(async (path: string, options?: RequestInit) => {
    if (options?.method) return json({ error: "failure" }, 500);
    if (path.endsWith("notification-preferences")) return json(prefs);
    if (path.endsWith("notification-subscriptions")) return json([]);
    if (path.endsWith("scheduled-events")) return json([event]);
    throw new Error(`Unexpected API request ${path}`);
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("keeps the preference draft after a failed save and serializes cleared quiet hours explicitly", async () => {
  const user = userEvent.setup();
  render(view());
  await screen.findByRole("checkbox", { name: "Shared expense alerts" });
  await user.click(
    screen.getByRole("checkbox", { name: "Shared expense alerts" }),
  );
  await user.click(screen.getByRole("button", { name: "Save preferences" }));
  await screen.findByRole("alert");
  expect(
    screen.getByRole("checkbox", { name: "Shared expense alerts" }),
  ).not.toBeChecked();
  const request = fetcher.mock.calls.find(
    ([, options]) => options?.method === "PUT",
  );
  expect(JSON.parse(request![1]!.body as string)).toMatchObject({
    expense_created_enabled: false,
    quiet_start_minutes: null,
    quiet_end_minutes: null,
  });
});
it("preserves recurrence qualifiers and disabled state when editing, and keeps draft on an API error", async () => {
  const user = userEvent.setup();
  render(view());
  await user.click(await screen.findByRole("button", { name: "Edit" }));
  const title = screen.getByLabelText("Title");
  await user.clear(title);
  await user.type(title, "New rent");
  await user.click(screen.getByRole("button", { name: "Save event" }));
  await screen.findByRole("alert");
  expect(title).toHaveValue("New rent");
  const request = fetcher.mock.calls.find(
    ([, options]) => options?.method === "PUT",
  );
  expect(JSON.parse(request![1]!.body as string)).toMatchObject({
    title: "New rent",
    enabled: false,
    rrule: "FREQ=MONTHLY;INTERVAL=1;COUNT=3;BYMONTHDAY=1",
  });
});
it("requires confirmation before deleting an event", async () => {
  const user = userEvent.setup();
  render(view());
  await user.click(await screen.findByRole("button", { name: "Delete" }));
  expect(
    fetcher.mock.calls.some(([, options]) => options?.method === "DELETE"),
  ).toBe(false);
  fetcher.mockImplementation(async (_path: string, options?: RequestInit) =>
    options?.method === "DELETE"
      ? new Response(null, { status: 204 })
      : json([]),
  );
  await user.click(
    within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "Delete",
    }),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("heading", { name: "Rent" }),
    ).not.toBeInTheDocument(),
  );
});
it("denies event mutation and creation to monitors, including the creator", async () => {
  render(view({ role: "monitor" }));
  await screen.findByRole("heading", { name: "Rent" });
  expect(
    screen.queryByRole("button", { name: "Edit" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Delete" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
});
it("handles unauthorized loads", async () => {
  fetcher.mockResolvedValue(json({ error: "unauthorized" }, 401));
  render(view());
  await waitFor(() => expect(props.onUnauthorized).toHaveBeenCalled());
  expect(
    screen.queryByRole("checkbox", { name: "Shared expense alerts" }),
  ).not.toBeInTheDocument();
});
it("ignores late load responses from the previous house", async () => {
  let resolve!: (response: Response) => void;
  const delayed = new Promise<Response>((done) => {
    resolve = done;
  });
  fetcher.mockImplementation(async (path: string) => {
    if (path === "/api/houses/a/notification-preferences") return delayed;
    if (path.endsWith("notification-preferences"))
      return json({ ...prefs, house_id: "b", timezone: "America/Sao_Paulo" });
    return json([]);
  });
  const result = render(view());
  result.rerender(view({ houseId: "b" }));
  await screen.findByDisplayValue("America/Sao_Paulo");
  await act(async () => resolve(json(prefs)));
  expect(screen.getByLabelText("Preference timezone")).toHaveValue(
    "America/Sao_Paulo",
  );
});
it("validates paired quiet hours before calling the API", async () => {
  render(view());
  const start = await screen.findByLabelText("Quiet start (local)");
  fireEvent.change(start, { target: { value: "22:00" } });
  fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("both");
  expect(
    fetcher.mock.calls.some(([, options]) => options?.method === "PUT"),
  ).toBe(false);
});
it("does not let a late mutation from the old house replace the new house preferences", async () => {
  let resolve!: (response: Response) => void;
  const pending = new Promise<Response>((done) => {
    resolve = done;
  });
  fetcher.mockImplementation(async (path: string, options?: RequestInit) => {
    if (options?.method === "PUT") return pending;
    if (path.endsWith("notification-preferences"))
      return json({
        ...prefs,
        house_id: path.includes("/b/") ? "b" : "a",
        timezone: path.includes("/b/") ? "America/Sao_Paulo" : "UTC",
      });
    return json([]);
  });
  const changed = vi.fn();
  const result = render(view({ onChanged: changed }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Save preferences" }),
  );
  result.rerender(view({ houseId: "b", onChanged: changed }));
  await screen.findByDisplayValue("America/Sao_Paulo");
  await act(async () => resolve(json(prefs)));
  expect(screen.getByLabelText("Preference timezone")).toHaveValue(
    "America/Sao_Paulo",
  );
  expect(changed).not.toHaveBeenCalled();
});
it("blocks duplicate submissions while saving preferences", async () => {
  let resolve!: (response: Response) => void;
  const pending = new Promise<Response>((done) => {
    resolve = done;
  });
  const original = fetcher.getMockImplementation()!;
  fetcher.mockImplementation((path: string, options?: RequestInit) =>
    options?.method === "PUT" ? pending : original(path, options),
  );
  render(view());
  const save = await screen.findByRole("button", { name: "Save preferences" });
  fireEvent.click(save);
  fireEvent.click(save);
  expect(save).toBeDisabled();
  expect(
    fetcher.mock.calls.filter(([, options]) => options?.method === "PUT"),
  ).toHaveLength(1);
  await act(async () => resolve(json(prefs)));
  expect(save).not.toBeDisabled();
});
it("preserves the full recurrence and exceptions when enabling a disabled event", async () => {
  const original = fetcher.getMockImplementation()!;
  fetcher.mockImplementation((path: string, options?: RequestInit) =>
    options?.method === "PUT"
      ? Promise.resolve(json({ ...event, enabled: true }))
      : original(path, options),
  );
  render(view());
  fireEvent.click(await screen.findByRole("button", { name: "Enable" }));
  await screen.findByRole("button", { name: "Disable" });
  const request = fetcher.mock.calls.find(
    ([, options]) => options?.method === "PUT",
  );
  expect(JSON.parse(request![1]!.body as string)).toEqual({
    title: "Rent",
    timezone: "Europe/Lisbon",
    dtstart_local: "2026-12-01T09:00:00",
    rrule: "FREQ=MONTHLY;INTERVAL=1;COUNT=3;BYMONTHDAY=1",
    exdates: [],
    enabled: true,
  });
});
it("handles unauthorized saves without clearing the form", async () => {
  const original = fetcher.getMockImplementation()!;
  fetcher.mockImplementation((path: string, options?: RequestInit) =>
    options?.method === "PUT"
      ? Promise.resolve(json({ error: "unauthorized" }, 401))
      : original(path, options),
  );
  render(view());
  const timezone = await screen.findByLabelText("Preference timezone");
  fireEvent.change(timezone, { target: { value: "Europe/Lisbon" } });
  fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));
  await waitFor(() => expect(props.onUnauthorized).toHaveBeenCalledOnce());
  expect(timezone).toHaveValue("Europe/Lisbon");
});
it("allows admins to edit other creators and keeps other members read-only for that event", async () => {
  const result = render(view({ user: { ...props.user, id: "other" } }));
  await screen.findByRole("heading", { name: "Rent" });
  expect(
    screen.queryByRole("button", { name: "Edit" }),
  ).not.toBeInTheDocument();
  result.rerender(
    view({ user: { ...props.user, id: "other" }, role: "admin" }),
  );
  expect(
    await screen.findByRole("button", { name: "Edit" }),
  ).toBeInTheDocument();
});
it("renders older API events with null exception lists", async () => {
  const original = fetcher.getMockImplementation()!;
  fetcher.mockImplementation((path: string, options?: RequestInit) =>
    path.endsWith("scheduled-events")
      ? Promise.resolve(json([{ ...event, exdates: null }]))
      : original(path, options),
  );
  render(view());
  fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
  expect(
    screen.getByLabelText("Exception local times (comma-separated)"),
  ).toHaveValue("");
});
it("offers a local browser reset on VAPID rotation even with no active server devices", async () => {
  const subscription = {
    options: { applicationServerKey: new Uint8Array([4, 9, 9, 9]).buffer },
    unsubscribe: vi.fn().mockResolvedValue(true),
  };
  const registration = {
    active: {},
    pushManager: { getSubscription: vi.fn().mockResolvedValue(subscription) },
  };
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("PushManager", function () {});
  vi.stubGlobal("Notification", { permission: "granted" });
  vi.stubGlobal("navigator", {
    language: "en",
    languages: ["en"],
    serviceWorker: {
      register: vi.fn().mockResolvedValue(registration),
      getRegistration: vi.fn().mockResolvedValue(registration),
    },
  });
  const original = fetcher.getMockImplementation()!;
  fetcher.mockImplementation((path: string, options?: RequestInit) =>
    path.endsWith("vapid-public-key")
      ? Promise.resolve(json({ public_key: "BAECAw" }))
      : original(path, options),
  );
  render(view());
  fireEvent.click(
    await screen.findByRole("button", { name: "Enable on this browser" }),
  );
  await screen.findByText(/server push key changed/);
  fireEvent.click(
    await screen.findByRole("button", { name: "Reset browser push" }),
  );
  expect(screen.getByRole("alertdialog")).toHaveTextContent(
    "Enable push again for each house",
  );
  fireEvent.click(
    within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "Reset",
    }),
  );
  await waitFor(() => expect(subscription.unsubscribe).toHaveBeenCalledOnce());
});
it("keeps house B subscribed when disabling house A and reuses the browser endpoint when A enables again", async () => {
  const subscription = {
    options: { applicationServerKey: new Uint8Array([4, 1, 2, 3]).buffer },
    toJSON: () => ({
      endpoint: "https://push.example/shared-browser",
      keys: { p256dh: "device-public-key", auth: "device-auth" },
    }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  };
  let browserSubscription: typeof subscription | null = null;
  subscription.unsubscribe.mockImplementation(async () => {
    browserSubscription = null;
    return true;
  });
  const manager = {
    getSubscription: vi.fn(async () => browserSubscription),
    subscribe: vi.fn(async () => {
      browserSubscription = subscription;
      return subscription;
    }),
  };
  const registration = { active: {}, pushManager: manager };
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("PushManager", function () {});
  vi.stubGlobal("Notification", { permission: "granted" });
  vi.stubGlobal("navigator", {
    language: "en",
    languages: ["en"],
    serviceWorker: {
      register: vi.fn().mockResolvedValue(registration),
      getRegistration: vi.fn().mockResolvedValue(registration),
    },
  });
  const devices = new Map<string, Record<string, unknown>>();
  fetcher.mockImplementation(async (path, options) => {
    if (path.endsWith("vapid-public-key")) return json({ public_key: "BAECAw" });
    const house = path.includes("/a/") ? "a" : "b";
    if (path.endsWith("notification-preferences"))
      return json({ ...prefs, house_id: house });
    if (path.endsWith("scheduled-events")) return json([]);
    if (options?.method === "DELETE") {
      devices.delete(house);
      return new Response(null, { status: 204 });
    }
    if (options?.method === "POST") {
      const saved = {
        ...JSON.parse(options.body as string),
        id: `device-${house}`,
        house_id: house,
        user_id: "me",
        created_at: "2026-11-01T00:00:00Z",
        last_seen_at: "2026-11-01T00:00:00Z",
      };
      devices.set(house, saved);
      return json(saved);
    }
    if (path.endsWith("notification-subscriptions"))
      return json(devices.has(house) ? [devices.get(house)] : []);
    throw new Error(`Unexpected API request ${path}`);
  });
  const result = render(view());
  fireEvent.click(
    await screen.findByRole("button", { name: "Enable on this browser" }),
  );
  await screen.findByText("Browser push enabled.");
  result.rerender(view({ houseId: "b" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Enable on this browser" }),
  );
  await screen.findByText("Browser push enabled.");
  result.rerender(view());
  fireEvent.click(
    await screen.findByRole("button", { name: "Disable browser push" }),
  );
  fireEvent.click(
    within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "Disable",
    }),
  );
  await screen.findByText("Browser push disabled.");
  expect(devices.has("a")).toBe(false);
  expect(devices.get("b")?.endpoint).toBe("https://push.example/shared-browser");
  expect(await manager.getSubscription()).toBe(subscription);
  expect(subscription.unsubscribe).not.toHaveBeenCalled();
  result.rerender(view({ houseId: "b" }));
  expect(
    await screen.findByRole("button", { name: "Disable browser push" }),
  ).toBeEnabled();
  result.rerender(view());
  fireEvent.click(
    await screen.findByRole("button", { name: "Enable on this browser" }),
  );
  await screen.findByText("Browser push enabled.");
  expect(devices.get("a")?.endpoint).toBe("https://push.example/shared-browser");
  expect(manager.subscribe).toHaveBeenCalledOnce();
});
