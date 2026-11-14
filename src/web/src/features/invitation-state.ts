let memoryToken: string | null = null;
const key = "roomies.pending.invitation";
export function invitationToken() {
  try {
    return sessionStorage.getItem(key) || memoryToken;
  } catch {
    return memoryToken;
  }
}
export function captureInvitation() {
  if (window.location.pathname !== "/accept-invitation") return;
  const value = new URLSearchParams(window.location.search).get("token");
  if (value) {
    memoryToken = value;
    try {
      sessionStorage.setItem(key, value);
    } catch {
      /* Keep the invitation in memory when storage is unavailable. */
    }
    window.history.replaceState(null, "", "/accept-invitation");
  }
}
export function hasPendingInvitation() {
  return !!invitationToken();
}
export function clearInvitation() {
  memoryToken = null;
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* The in-memory invitation is already cleared. */
  }
}
