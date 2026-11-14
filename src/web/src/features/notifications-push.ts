export type PushState =
  | "unsupported"
  | "insecure"
  | "denied"
  | "default"
  | "granted";
export function browserPushState(): PushState {
  if (!globalThis.isSecureContext) return "insecure";
  if (
    !navigator.serviceWorker ||
    typeof globalThis.PushManager === "undefined" ||
    typeof globalThis.Notification === "undefined"
  )
    return "unsupported";
  return Notification.permission;
}
export async function requestBrowserPushPermission() {
  const state = browserPushState();
  if (state === "unsupported" || state === "insecure" || state === "denied")
    throw new Error(state);
  const permission =
    state === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error(permission === "denied" ? "denied" : "dismissed");
}
export async function subscribeBrowserPush(publicKey: string, label: string) {
  await requestBrowserPushPermission();
  if (!publicKey) throw new Error("unconfigured");
  let applicationServerKey: Uint8Array<ArrayBuffer>;
  try {
    applicationServerKey = Uint8Array.from(
      atob(publicKey.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0),
    );
  } catch {
    throw new Error("key");
  }
  const registration = await navigator.serviceWorker.register(
    "/roomies-push-sw.js",
    { scope: "/" },
  );
  if (!registration.active) await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing?.options.applicationServerKey) {
    const previousKey = new Uint8Array(existing.options.applicationServerKey);
    if (
      previousKey.length !== applicationServerKey.length ||
      previousKey.some((b, i) => b !== applicationServerKey[i])
    )
      throw new Error("keyChanged");
  }
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    }));
  const json = subscription.toJSON();
  let endpoint: URL;
  try {
    endpoint = new URL(json.endpoint ?? "");
  } catch {
    throw new Error("subscription");
  }
  if (
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    !json.keys?.p256dh ||
    !json.keys?.auth
  )
    throw new Error("subscription");
  return {
    platform: "web_push",
    device_label: label,
    endpoint: endpoint.href,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
  };
}
export async function unsubscribeBrowserPush() {
  if (!navigator.serviceWorker) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription && !(await subscription.unsubscribe()))
    throw new Error("unsubscribe");
}
