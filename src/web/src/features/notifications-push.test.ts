import { afterEach, describe, expect, it, vi } from "vitest";
import {
  browserPushState,
  subscribeBrowserPush,
  unsubscribeBrowserPush,
} from "./notifications-push";

afterEach(() => vi.unstubAllGlobals());
function browser(permission: NotificationPermission = "granted") {
  const subscription = {
    toJSON: () => ({
      endpoint: "https://push.example/device",
      keys: { p256dh: "device-public-key", auth: "device-auth" },
    }),
    unsubscribe: vi.fn().mockResolvedValue(true),
    options: {},
  };
  const manager = {
    getSubscription: vi.fn().mockResolvedValue(null),
    subscribe: vi.fn().mockResolvedValue(subscription),
  };
  const registration = { active: {}, pushManager: manager };
  const register = vi.fn().mockResolvedValue(registration);
  const requestPermission = vi.fn().mockResolvedValue(permission);
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("PushManager", function () {});
  vi.stubGlobal("Notification", { permission, requestPermission });
  vi.stubGlobal("navigator", {
    serviceWorker: {
      register,
      ready: Promise.resolve(registration),
      getRegistration: vi.fn().mockResolvedValue(registration),
    },
  });
  return { subscription, manager, register, requestPermission };
}
describe("browser push", () => {
  it("distinguishes unsupported, insecure and denied states without prompting", () => {
    browser("denied");
    expect(browserPushState()).toBe("denied");
    vi.stubGlobal("isSecureContext", false);
    expect(browserPushState()).toBe("insecure");
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("PushManager", undefined);
    expect(browserPushState()).toBe("unsupported");
  });
  it("does not register or subscribe when permission is denied or dismissed", async () => {
    const denied = browser("denied");
    await expect(subscribeBrowserPush("BAECAw", "Browser")).rejects.toThrow(
      "denied",
    );
    expect(denied.register).not.toHaveBeenCalled();
    const dismissed = browser("default");
    await expect(subscribeBrowserPush("BAECAw", "Browser")).rejects.toThrow(
      "dismissed",
    );
    expect(dismissed.manager.subscribe).not.toHaveBeenCalled();
  });
  it("sends the public VAPID key to the browser and returns the device keys to the API", async () => {
    const { manager } = browser();
    expect(await subscribeBrowserPush("BAECAw", "My browser")).toEqual({
      platform: "web_push",
      device_label: "My browser",
      endpoint: "https://push.example/device",
      p256dh: "device-public-key",
      auth: "device-auth",
    });
    expect(manager.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: new Uint8Array([4, 1, 2, 3]),
    });
  });
  it("reuses the existing device subscription rather than creating duplicate endpoints", async () => {
    const { manager, subscription } = browser();
    manager.getSubscription.mockResolvedValue(subscription);
    expect((await subscribeBrowserPush("BAECAw", "Browser")).endpoint).toBe(
      "https://push.example/device",
    );
    expect(manager.subscribe).not.toHaveBeenCalled();
  });
  it("rejects incomplete or insecure device credentials", async () => {
    const { manager } = browser();
    manager.subscribe.mockResolvedValue({
      toJSON: () => ({ endpoint: "http://push.example/device", keys: {} }),
    });
    await expect(subscribeBrowserPush("BAECAw", "Browser")).rejects.toThrow(
      "subscription",
    );
  });
  it("unsubscribes the local device without requesting notification permission", async () => {
    const { manager, subscription, requestPermission } = browser();
    manager.getSubscription.mockResolvedValue(subscription);
    await unsubscribeBrowserPush();
    expect(subscription.unsubscribe).toHaveBeenCalledOnce();
    expect(requestPermission).not.toHaveBeenCalled();
  });
});
it("requires an explicit browser reset after the server VAPID key changes", async () => {
  const { manager, subscription } = browser();
  manager.getSubscription.mockResolvedValue({
    ...subscription,
    options: { applicationServerKey: new Uint8Array([4, 9, 9, 9]).buffer },
  });
  await expect(subscribeBrowserPush("BAECAw", "Browser")).rejects.toThrow(
    "keyChanged",
  );
  expect(manager.subscribe).not.toHaveBeenCalled();
  expect(subscription.unsubscribe).not.toHaveBeenCalled();
});
