import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import { api, ApiError } from "@/lib/api";
import { PreferencesProvider } from "@/lib/preferences";
import type { FeatureProps } from "@/lib/features";
import { Calendar, Chores, Groceries } from "./household";

vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: vi.fn(),
}));
const props: FeatureProps = {
  houseId: "our house",
  user: { id: "me", name: "Alex", email: "a@example.com" },
  role: "member",
  members: [{ user_id: "me", user_name: "Alex", role: "member" }],
  onUnauthorized: vi.fn(),
  onChanged: vi.fn(),
};
const grocery = {
  id: "g/1",
  house_id: "our house",
  creator_id: "other",
  name: "Milk",
  quantity: "2",
  unit: "L",
  note: "Oat",
  assignee_id: "me",
  checked: false,
  position: 0,
  version: 3,
};
const chore = {
  id: "c1",
  house_id: "our house",
  creator_id: "me",
  title: "Clean",
  description: "Kitchen",
  assignee_id: "me",
  timezone: "America/Sao_Paulo",
  due_local: "2026-11-20T08:30:00",
  rrule: "FREQ=WEEKLY;COUNT=3",
  exdates: ["2026-11-27T08:30:00"],
  enabled: true,
  version: 7,
};
const event = {
  id: "e1",
  house_id: "our house",
  creator_id: "other",
  title: "Dinner",
  description: "",
  timezone: "UTC",
  start_local: "2026-11-20T18:00:00",
  end_local: "2026-11-20T19:00:00",
  all_day: false,
  rrule: "FREQ=WEEKLY;COUNT=1",
  exdates: [],
  version: 4,
};
function view(Component: typeof Groceries, extra: Partial<FeatureProps> = {}) {
  return (
    <PreferencesProvider>
      <Component {...props} {...extra} />
    </PreferencesProvider>
  );
}
beforeEach(() => {
  localStorage.clear();
  vi.mocked(api).mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("household permissions", () => {
  it.each([null, "monitor"])(
    "keeps role %s read-only across all household features",
    async (role) => {
      vi.mocked(api).mockImplementation(async (path) =>
        path.endsWith("/groceries")
          ? [grocery]
          : path.endsWith("/chores")
            ? [chore]
            : [event],
      );
      render(
        <PreferencesProvider>
          <Groceries {...props} role={role} />
          <Chores {...props} role={role} />
          <Calendar {...props} role={role} />
        </PreferencesProvider>,
      );
      await screen.findByRole("heading", { name: "Milk" });
      await screen.findByRole("heading", { name: "Clean" });
      await screen.findByRole("heading", { name: "Dinner" });
      expect(
        screen.queryByRole("button", {
          name: /add grocery|create chore|create event|delete|disable|check/i,
        }),
      ).not.toBeInTheDocument();
    },
  );
  it("allows grocery actions for members but restricts chore and event actions to creator or admin", async () => {
    vi.mocked(api).mockImplementation(async (path) =>
      path.endsWith("/groceries")
        ? [grocery]
        : path.endsWith("/chores")
          ? [{ ...chore, creator_id: "other" }]
          : [event],
    );
    const result = render(view(Chores));
    await screen.findByRole("heading", { name: "Clean" });
    expect(
      screen.queryByRole("button", { name: "Disable" }),
    ).not.toBeInTheDocument();
    result.rerender(view(Chores, { role: "admin" }));
    expect(screen.getByRole("button", { name: "Disable" })).toBeInTheDocument();
    result.rerender(view(Calendar));
    await screen.findByRole("heading", { name: "Dinner" });
    expect(
      screen.queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
  });
  it("removes write controls when permission changes", async () => {
    const result = render(view(Groceries));
    await screen.findByRole("button", { name: "Add grocery" });
    result.rerender(view(Groceries, { role: "monitor" }));
    expect(
      screen.queryByRole("button", { name: "Add grocery" }),
    ).not.toBeInTheDocument();
  });
});

it("preserves grocery fields on failure and creates with all fields on retry", async () => {
  let fail = true;
  vi.mocked(api).mockImplementation(async (_path, init) => {
    if (init?.method === "POST") {
      if (fail) throw new ApiError(500, "failure");
      return { ...grocery, name: "Bread" };
    }
    return [];
  });
  const actor = userEvent.setup();
  render(view(Groceries));
  await actor.type(await screen.findByLabelText("Name"), "Bread");
  await actor.click(screen.getByText("More options", { selector: "summary" }));
  await actor.type(screen.getByLabelText("Quantity"), "2");
  await actor.type(screen.getByLabelText("Unit"), "loaves");
  await actor.type(screen.getByLabelText("Note"), "Whole grain");
  await actor.click(screen.getByRole("combobox", { name: "Assignee" }));
  await actor.click(await screen.findByRole("option", { name: "Alex" }));
  await actor.click(screen.getByRole("button", { name: "Add grocery" }));
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(screen.getByLabelText("Name")).toHaveValue("Bread");
  fail = false;
  await actor.click(screen.getByRole("button", { name: "Add grocery" }));
  await waitFor(() => expect(screen.getByLabelText("Name")).toHaveValue(""));
  expect(api).toHaveBeenLastCalledWith("/houses/our%20house/groceries");
  expect(api).toHaveBeenCalledWith(
    "/houses/our%20house/groceries",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        name: "Bread",
        quantity: "2",
        unit: "loaves",
        note: "Whole grain",
        assignee_id: "me",
        position: 0,
      }),
    }),
  );
  expect(props.onChanged).toHaveBeenCalled();
});

it("sends the latest grocery version after a conflict and never toggles optimistically", async () => {
  let version = 3;
  let conflict = true;
  vi.mocked(api).mockImplementation(async (_path, init) => {
    if (init?.method === "POST") {
      if (conflict) {
        version = 4;
        throw new ApiError(409, "version conflict");
      }
      version = 5;
      return { ...grocery, checked: true, version: 5 };
    }
    return [{ ...grocery, version, checked: version === 5 }];
  });
  const actor = userEvent.setup();
  render(view(Groceries));
  await actor.click(await screen.findByRole("button", { name: "Check" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/changed/i);
  expect(screen.getByText("Needed")).toBeInTheDocument();
  conflict = false;
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Check" })).toBeEnabled(),
  );
  await actor.click(screen.getByRole("button", { name: "Check" }));
  expect(api).toHaveBeenCalledWith(
    "/houses/our%20house/groceries/g%2F1/toggle",
    { method: "POST", body: JSON.stringify({ checked: true, version: 4 }) },
  );
  expect(
    await screen.findByRole("button", { name: "Uncheck" }),
  ).toBeInTheDocument();
});

it("requires accessible confirmation before a versioned delete", async () => {
  vi.mocked(api).mockImplementation(async (_path, init) =>
    init?.method === "DELETE" ? undefined : [grocery],
  );
  const actor = userEvent.setup();
  render(view(Groceries));
  await actor.click(await screen.findByRole("button", { name: "Delete" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(api).not.toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ method: "DELETE" }),
  );
  await actor.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await actor.click(screen.getByRole("button", { name: "Delete" }));
  await actor.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Delete",
    }),
  );
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      "/houses/our%20house/groceries/g%2F1?version=3",
      { method: "DELETE" },
    ),
  );
});

it("preserves every chore schedule field and version when disabling", async () => {
  vi.mocked(api).mockResolvedValue([chore]);
  const actor = userEvent.setup();
  render(view(Chores));
  await actor.click(await screen.findByRole("button", { name: "Disable" }));
  expect(api).toHaveBeenCalledWith("/houses/our%20house/chores/c1", {
    method: "PUT",
    body: JSON.stringify({
      title: "Clean",
      description: "Kitchen",
      assignee_id: "me",
      timezone: "America/Sao_Paulo",
      due_local: "2026-11-20T08:30:00",
      rrule: "FREQ=WEEKLY;COUNT=3",
      exdates: ["2026-11-27T08:30:00"],
      enabled: false,
      version: 7,
    }),
  });
});

it.each([
  [Chores, chore, "chores", 7],
  [Calendar, { ...event, creator_id: "me" }, "calendar", 4],
] as const)(
  "deletes owned schedules with their version and supports cancelling on failure",
  async (Component, item, resource, version) => {
    vi.mocked(api).mockImplementation(async (_path, init) => {
      if (init?.method === "DELETE") throw new ApiError(500, "failure");
      return [item];
    });
    const actor = userEvent.setup();
    render(view(Component));
    await actor.click(await screen.findByRole("button", { name: "Delete" }));
    await actor.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Delete",
      }),
    );
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        `/houses/our%20house/${resource}/${item.id}?version=${version}`,
        { method: "DELETE" },
      ),
    );
    expect(
      within(screen.getByRole("alertdialog")).getByRole("alert"),
    ).toBeInTheDocument();
    await actor.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Cancel",
      }),
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: item.title }),
    ).toBeInTheDocument();
  },
);

it("refreshes a conflicted delete version but requires a second explicit confirmation", async () => {
  let version = 3;
  let deleted = false;
  vi.mocked(api).mockImplementation(async (_path, init) => {
    if (init?.method === "DELETE") {
      if (version === 3) {
        version = 4;
        throw new ApiError(409, "version conflict");
      }
      deleted = true;
      return undefined;
    }
    return deleted ? [] : [{ ...grocery, version }];
  });
  const actor = userEvent.setup();
  render(view(Groceries));
  await actor.click(await screen.findByRole("button", { name: "Delete" }));
  await actor.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Delete",
    }),
  );
  expect(
    await within(screen.getByRole("alertdialog")).findByRole("alert"),
  ).toHaveTextContent(/changed/i);
  await waitFor(() =>
    expect(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Delete",
      }),
    ).toBeEnabled(),
  );
  expect(api).not.toHaveBeenCalledWith(
    "/houses/our%20house/groceries/g%2F1?version=4",
    { method: "DELETE" },
  );
  await actor.click(
    within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "Delete",
    }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
  );
  expect(api).toHaveBeenCalledWith(
    "/houses/our%20house/groceries/g%2F1?version=4",
    { method: "DELETE" },
  );
  expect(
    screen.queryByRole("heading", { name: "Milk" }),
  ).not.toBeInTheDocument();
});

it("allows closing a delete dialog when a conflict refresh fails", async () => {
  let conflict = false;
  vi.mocked(api).mockImplementation(async (_path, init) => {
    if (init?.method === "DELETE") {
      conflict = true;
      throw new ApiError(409, "version conflict");
    }
    if (conflict) throw new ApiError(500, "failed to reload");
    return [grocery];
  });
  const actor = userEvent.setup();
  render(view(Groceries));
  await actor.click(await screen.findByRole("button", { name: "Delete" }));
  await actor.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Delete",
    }),
  );
  await waitFor(() =>
    expect(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Cancel",
      }),
    ).toBeEnabled(),
  );
  expect(
    within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "Delete",
    }),
  ).toBeDisabled();
  await actor.click(
    within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "Cancel",
    }),
  );
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
});

it("creates a chore using wall-clock time, recurrence and exception dates without a browser timezone conversion", async () => {
  const actor = userEvent.setup();
  render(view(Chores));
  await actor.type(await screen.findByLabelText("Title"), "Water plants");
  fireEvent.change(screen.getByLabelText("Due local"), {
    target: { value: "2026-11-20T08:30" },
  });
  await actor.click(screen.getByText("More options", { selector: "summary" }));
  await actor.clear(screen.getByLabelText("Timezone"));
  await actor.type(screen.getByLabelText("Timezone"), "America/Sao_Paulo");
  await actor.clear(screen.getByLabelText("Recurrence (RRULE)"));
  await actor.type(
    screen.getByLabelText("Recurrence (RRULE)"),
    "FREQ=WEEKLY;COUNT=3",
  );
  await actor.type(
    screen.getByLabelText("Exception dates"),
    "2026-11-27T08:30",
  );
  await actor.click(screen.getByRole("button", { name: "Create chore" }));
  expect(api).toHaveBeenCalledWith(
    "/houses/our%20house/chores",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        title: "Water plants",
        description: "",
        assignee_id: null,
        timezone: "America/Sao_Paulo",
        due_local: "2026-11-20T08:30:00",
        rrule: "FREQ=WEEKLY;COUNT=3",
        exdates: ["2026-11-27T08:30:00"],
        enabled: true,
      }),
    }),
  );
});

it("locks custom form controls while a chore save is pending", async () => {
  let rejectSave!: (error: unknown) => void;
  vi.mocked(api).mockImplementation((_path, init) =>
    init?.method === "POST"
      ? new Promise((_resolve, reject) => {
          rejectSave = reject;
        })
      : Promise.resolve([]),
  );
  const actor = userEvent.setup();
  render(view(Chores));
  await actor.type(await screen.findByLabelText("Title"), "Clean");
  fireEvent.change(screen.getByLabelText("Due local"), {
    target: { value: "2026-11-20T08:30" },
  });
  await actor.click(screen.getByText("More options", { selector: "summary" }));
  await actor.click(screen.getByRole("button", { name: "Create chore" }));
  await actor.click(screen.getByRole("checkbox", { name: "Enabled" }));
  expect(screen.getByRole("checkbox", { name: "Enabled" })).toBeChecked();
  await act(async () => rejectSave(new ApiError(500, "failure")));
});

it("defaults the calendar end one hour later and rejects reversed ranges without losing fields", async () => {
  render(view(Calendar));
  fireEvent.change(await screen.findByLabelText("Title"), {
    target: { value: "Dinner" },
  });
  fireEvent.change(screen.getByLabelText("Start local"), {
    target: { value: "2026-12-31T23:30" },
  });
  expect(screen.getByLabelText("End local")).toHaveValue("2027-01-01T00:30");
  fireEvent.change(screen.getByLabelText("End local"), {
    target: { value: "2026-12-31T22:00" },
  });
  fireEvent.submit(
    screen
      .getByRole("button", { name: "Create calendar event" })
      .closest("form")!,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    /end.*after.*start/i,
  );
  expect(screen.getByLabelText("Title")).toHaveValue("Dinner");
  expect(api).not.toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ method: "POST" }),
  );
});

it("sends all-day calendar dates as local midnight, with an exclusive end", async () => {
  const actor = userEvent.setup();
  render(view(Calendar));
  await actor.type(await screen.findByLabelText("Title"), "Holiday");
  await actor.click(screen.getByText("More options", { selector: "summary" }));
  await actor.click(screen.getByRole("checkbox", { name: "All day" }));
  fireEvent.change(screen.getByLabelText("Start local"), {
    target: { value: "2026-11-20" },
  });
  expect(screen.getByLabelText("End local")).toHaveValue("2026-11-21");
  await actor.click(
    screen.getByRole("button", { name: "Create calendar event" }),
  );
  expect(api).toHaveBeenCalledWith(
    "/houses/our%20house/calendar",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        title: "Holiday",
        description: "",
        timezone: "UTC",
        start_local: "2026-11-20T00:00:00",
        end_local: "2026-11-21T00:00:00",
        all_day: true,
        rrule: "FREQ=WEEKLY;INTERVAL=1;COUNT=1",
        exdates: [],
      }),
    }),
  );
});

it("retains the calendar draft after backend recurrence validation fails", async () => {
  vi.mocked(api).mockImplementation(async (_path, init) => {
    if (init?.method === "POST") throw new ApiError(400, "invalid RRULE UNTIL");
    return [];
  });
  const actor = userEvent.setup();
  render(view(Calendar));
  await actor.type(await screen.findByLabelText("Title"), "Dinner");
  await actor.click(screen.getByText("More options", { selector: "summary" }));
  await actor.type(screen.getByLabelText("Description"), "Bring dessert");
  fireEvent.change(screen.getByLabelText("Start local"), {
    target: { value: "2026-11-20T18:00" },
  });
  await actor.clear(screen.getByLabelText("Recurrence (RRULE)"));
  await actor.type(
    screen.getByLabelText("Recurrence (RRULE)"),
    "FREQ=WEEKLY;UNTIL=invalid",
  );
  await actor.click(
    screen.getByRole("button", { name: "Create calendar event" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(/recurrence/i);
  expect(screen.getByLabelText("Title")).toHaveValue("Dinner");
  expect(screen.getByLabelText("Description")).toHaveValue("Bring dessert");
  expect(screen.getByLabelText("Start local")).toHaveValue("2026-11-20T18:00");
  expect(screen.getByLabelText("Recurrence (RRULE)")).toHaveValue(
    "FREQ=WEEKLY;UNTIL=invalid",
  );
});

it("retries a failed household load", async () => {
  vi.mocked(api)
    .mockRejectedValueOnce(new ApiError(500, "failed"))
    .mockResolvedValueOnce([]);
  const actor = userEvent.setup();
  render(view(Groceries));
  await actor.click(await screen.findByRole("button", { name: "Retry" }));
  await screen.findByLabelText("Name");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("ignores stale load failures after switching houses", async () => {
  let rejectOld!: (error: unknown) => void;
  vi.mocked(api).mockImplementation((path) =>
    path.includes("our%20house")
      ? new Promise((_resolve, reject) => {
          rejectOld = reject;
        })
      : Promise.resolve([{ ...grocery, name: "New house milk" }]),
  );
  const result = render(view(Groceries));
  result.rerender(view(Groceries, { houseId: "new" }));
  await screen.findByRole("heading", { name: "New house milk" });
  await act(async () => rejectOld(new ApiError(401, "unauthorized")));
  expect(props.onUnauthorized).not.toHaveBeenCalled();
  expect(
    screen.getByRole("heading", { name: "New house milk" }),
  ).toBeInTheDocument();
});

it("does not clear a new household draft when an old mutation finishes", async () => {
  let finish!: (value: unknown) => void;
  vi.mocked(api).mockImplementation((_path, init) =>
    init?.method === "POST"
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : Promise.resolve([]),
  );
  const actor = userEvent.setup();
  const result = render(view(Groceries));
  await actor.type(await screen.findByLabelText("Name"), "Old draft");
  await actor.click(screen.getByRole("button", { name: "Add grocery" }));
  result.rerender(view(Groceries, { houseId: "new" }));
  await actor.type(await screen.findByLabelText("Name"), "New draft");
  await act(async () => finish(grocery));
  expect(screen.getByLabelText("Name")).toHaveValue("New draft");
  expect(props.onChanged).not.toHaveBeenCalled();
});

it("routes current unauthorized failures to the controller", async () => {
  vi.mocked(api).mockRejectedValue(new ApiError(401, "unauthorized"));
  render(view(Chores));
  await waitFor(() => expect(props.onUnauthorized).toHaveBeenCalledTimes(1));
});

it.each([
  ["pt", "Compras", "Adicionar item"],
  ["es", "Compras", "Añadir producto"],
])("translates grocery controls for %s", async (language, heading, action) => {
  localStorage.setItem("roomies.web.preferences", JSON.stringify({ language }));
  render(view(Groceries));
  expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
  expect(
    await screen.findByRole("button", { name: action }),
  ).toBeInTheDocument();
});
