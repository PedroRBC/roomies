import { afterEach, expect, it, vi } from "vitest";
import { api, ApiError } from "./api";

afterEach(() => vi.unstubAllGlobals());

it("uses same-origin cookies and the web header without exposing tokens", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ id: "user" }));
  vi.stubGlobal("fetch", fetch);
  await api("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "a@example.com" }),
  });
  expect(fetch).toHaveBeenCalledWith(
    "/api/auth/login",
    expect.objectContaining({
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-Roomies-Client": "web",
      },
    }),
  );
});

it("preserves server validation messages and HTTP status", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ error: "not a member" }, { status: 403 }),
      ),
  );
  await expect(api("/houses/private/expenses")).rejects.toMatchObject({
    message: "not a member",
    status: 403,
  });
});

it("handles non-JSON errors and empty successful responses", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(new Response("Bad gateway", { status: 502 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 })),
  );
  await expect(api("/houses")).rejects.toBeInstanceOf(ApiError);
  await expect(
    api("/auth/logout", { method: "POST" }),
  ).resolves.toBeUndefined();
});
