import { OPENWHISPR_API_URL } from "../config/constants";
import { openExternalLink } from "../utils/externalLinks";
import logger from "../utils/logger";

// Session token management for desktop app
// Token is a long-lived session token (90 days) created by the web backend
// after Clerk authentication completes in the browser.

const SESSION_TOKEN_KEY = "openwhispr:sessionToken";
const SESSION_USER_KEY = "openwhispr:sessionUser";
const LAST_SIGN_IN_STORAGE_KEY = "openwhispr:lastSignInTime";
const GRACE_PERIOD_MS = 60_000;

export interface SessionUser {
  id: string;
  email: string;
  name?: string | null;
  plan?: string;
  image?: string | null;
}

function getLocalStorageSafe(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// --- Session Token ---

export function getSessionToken(): string | null {
  const storage = getLocalStorageSafe();
  return storage?.getItem(SESSION_TOKEN_KEY) ?? null;
}

export function setSessionToken(token: string): void {
  const storage = getLocalStorageSafe();
  storage?.setItem(SESSION_TOKEN_KEY, token);
}

function clearSessionToken(): void {
  const storage = getLocalStorageSafe();
  storage?.removeItem(SESSION_TOKEN_KEY);
}

// --- Session User ---

export function getSessionUser(): SessionUser | null {
  const storage = getLocalStorageSafe();
  const raw = storage?.getItem(SESSION_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setSessionUser(user: SessionUser): void {
  const storage = getLocalStorageSafe();
  storage?.setItem(SESSION_USER_KEY, JSON.stringify(user));
}

function clearSessionUser(): void {
  const storage = getLocalStorageSafe();
  storage?.removeItem(SESSION_USER_KEY);
}

// --- Grace Period (kept for backward compat during auth handoff) ---

let lastSignInTime: number | null = null;

export function updateLastSignInTime(): void {
  const now = Date.now();
  lastSignInTime = now;
  const storage = getLocalStorageSafe();
  storage?.setItem(LAST_SIGN_IN_STORAGE_KEY, String(now));
}

export function isWithinGracePeriod(): boolean {
  if (!lastSignInTime) {
    const storage = getLocalStorageSafe();
    const raw = storage?.getItem(LAST_SIGN_IN_STORAGE_KEY);
    if (raw) lastSignInTime = Number(raw);
  }
  if (!lastSignInTime) return false;
  return Date.now() - lastSignInTime < GRACE_PERIOD_MS;
}

function clearGracePeriod(): void {
  lastSignInTime = null;
  const storage = getLocalStorageSafe();
  storage?.removeItem(LAST_SIGN_IN_STORAGE_KEY);
}

// --- Auth Actions ---

export function isAuthenticated(): boolean {
  return !!getSessionToken();
}

export function getAuthHeaders(): Record<string, string> {
  const token = getSessionToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export async function signInWithBrowser(): Promise<{ error?: Error }> {
  if (!OPENWHISPR_API_URL) {
    return { error: new Error("API URL not configured") };
  }

  try {
    const isElectron = Boolean((window as any).electronAPI);

    if (isElectron) {
      // Determine protocol based on environment
      const protocol = (import.meta.env.VITE_OPENWHISPR_PROTOCOL || "openwhispr").trim();
      const signInUrl = `${OPENWHISPR_API_URL}/sign-in?redirect_url=/auth/electron-callback?protocol=${encodeURIComponent(protocol)}`;
      openExternalLink(signInUrl);
      return {};
    }

    // Non-Electron: redirect directly
    window.location.href = `${OPENWHISPR_API_URL}/sign-in`;
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error : new Error("Sign-in failed") };
  }
}

export async function signOut(): Promise<void> {
  try {
    // Revoke server-side session
    const token = getSessionToken();
    if (token && OPENWHISPR_API_URL) {
      fetch(`${OPENWHISPR_API_URL}/api/auth/desktop-session`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }

    // Clear Electron session cookies (cleanup)
    if (window.electronAPI?.authClearSession) {
      await window.electronAPI.authClearSession();
    }

    // Notify main process to clear stored token
    if (window.electronAPI?.authSetSession) {
      await window.electronAPI.authSetSession(null, null);
    }
  } catch {
    // Continue with local cleanup
  }

  clearSessionToken();
  clearSessionUser();
  clearGracePeriod();

  const storage = getLocalStorageSafe();
  storage?.setItem("isSignedIn", "false");
}

/**
 * Handle the callback from the browser OAuth flow.
 * Called when Electron captures the openwhispr://auth/callback URL.
 */
export function handleAuthCallback(params: URLSearchParams): {
  success: boolean;
  user?: SessionUser;
} {
  const token = params.get("token");
  const userId = params.get("userId");
  const email = params.get("email");
  const name = params.get("name");
  const plan = params.get("plan");

  if (!token || !email) {
    logger.error("Auth callback missing token or email", undefined, "auth");
    return { success: false };
  }

  setSessionToken(token);

  const user: SessionUser = {
    id: userId || "",
    email,
    name: name || null,
    plan: plan || "free",
  };
  setSessionUser(user);
  updateLastSignInTime();

  // Store in main process
  if (window.electronAPI?.authSetSession) {
    window.electronAPI.authSetSession(token, user as unknown as Record<string, unknown>);
  }

  logger.debug("Auth callback processed", { email, plan }, "auth");
  return { success: true, user };
}

// --- Session Refresh Wrapper (simplified from Neon's version) ---

export async function withSessionRefresh<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    const isAuthExpired =
      error?.code === "AUTH_EXPIRED" ||
      error?.message?.toLowerCase().includes("session expired") ||
      error?.message?.toLowerCase().includes("unauthorized");

    if (isAuthExpired) {
      // Clear auth state and let the UI handle re-authentication
      await signOut();
    }

    throw error;
  }
}
