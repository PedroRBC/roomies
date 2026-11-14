/// <reference types="node" />
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = () => readFileSync("public/roomies-push-sw.js", "utf8");
function worker() {
  const listeners: Record<string, (event: any) => void> = {};
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const openWindow = vi.fn().mockResolvedValue(undefined);
  const matchAll = vi.fn().mockResolvedValue([]);
  runInNewContext(source(), {
    URL,
    encodeURIComponent,
    self: {
      location: { origin: "https://roomies.example" },
      navigator: { language: "en" },
      registration: { showNotification },
      clients: { matchAll, openWindow, claim: vi.fn() },
      skipWaiting: vi.fn(),
      addEventListener: (name: string, handler: (event: any) => void) => {
        listeners[name] = handler;
      },
    },
  });
  return { listeners, showNotification, openWindow, matchAll };
}
describe("push service worker security", () => {
  it("ignores payload title and text and displays a generic notification", async () => {
    const { listeners, showNotification } = worker();
    let done: Promise<unknown> = Promise.resolve();
    listeners.push({
      data: {
        json: () => ({
          house_id: "house/a",
          text: "Private expense",
          title: "Fake login",
          url: "https://evil.example",
        }),
      },
      waitUntil: (p: Promise<unknown>) => {
        done = p;
      },
    });
    await done;
    expect(showNotification).toHaveBeenCalledWith(
      "Roomies",
      expect.objectContaining({
        body: "You have a Roomies notification.",
        data: { url: "/house/house%2Fa" },
      }),
    );
  });
  it.each([
    "https://evil.example/login",
    "//evil.example",
    "javascript:alert(1)",
    "https://roomies.example@evil.example/",
    "data:text/html,hello",
  ])("blocks click navigation to %s", async (url) => {
    const { listeners, openWindow } = worker();
    let done: Promise<unknown> = Promise.resolve();
    listeners.notificationclick({
      notification: { data: { url }, close: vi.fn() },
      waitUntil: (p: Promise<unknown>) => {
        done = p;
      },
    });
    await done;
    expect(openWindow).toHaveBeenCalledWith("https://roomies.example/");
  });
  it("focuses an existing same-origin house window instead of opening another", async () => {
    const { listeners, matchAll, openWindow } = worker();
    const focus = vi.fn().mockResolvedValue(undefined);
    matchAll.mockResolvedValue([
      { url: "https://roomies.example/house/a", focus },
    ]);
    let done: Promise<unknown> = Promise.resolve();
    listeners.notificationclick({
      notification: { data: { url: "/house/a" }, close: vi.fn() },
      waitUntil: (p: Promise<unknown>) => {
        done = p;
      },
    });
    await done;
    expect(focus).toHaveBeenCalledOnce();
    expect(openWindow).not.toHaveBeenCalled();
  });
  it("handles malformed push data", async () => {
    const { listeners, showNotification } = worker();
    let done: Promise<unknown> = Promise.resolve();
    listeners.push({
      data: {
        json: () => {
          throw new Error("invalid JSON");
        },
      },
      waitUntil: (p: Promise<unknown>) => {
        done = p;
      },
    });
    await done;
    expect(showNotification).toHaveBeenCalledOnce();
  });
});
