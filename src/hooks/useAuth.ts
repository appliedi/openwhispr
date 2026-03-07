import { useEffect, useRef, useState, useCallback } from "react";
import {
  isAuthenticated,
  getSessionToken,
  getSessionUser,
  isWithinGracePeriod,
  type SessionUser,
} from "../lib/clerkAuth";
import logger from "../utils/logger";
import { useSettingsStore } from "../stores/settingsStore";

export function useAuth() {
  const [user, setUser] = useState<SessionUser | null>(getSessionUser);
  const [isLoaded, setIsLoaded] = useState(false);

  const hasToken = isAuthenticated();
  const gracePeriodActive = isWithinGracePeriod();
  const isSignedIn = hasToken || gracePeriodActive;

  const lastSyncedRef = useRef(false);

  // Re-check auth state on mount and after storage changes
  const refreshAuth = useCallback(() => {
    setUser(getSessionUser());
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    refreshAuth();

    // Listen for storage changes (e.g., after auth callback sets token)
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "flowrytr:sessionToken" || e.key === "flowrytr:sessionUser") {
        refreshAuth();
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [refreshAuth]);

  useEffect(() => {
    if (isLoaded && isSignedIn && !lastSyncedRef.current) {
      logger.debug(
        "Auth state sync",
        { isSignedIn, hasToken, gracePeriod: gracePeriodActive },
        "auth"
      );
      useSettingsStore.getState().setIsSignedIn(true);
      lastSyncedRef.current = true;

      // Restore session token to main process (lost on app restart)
      const token = getSessionToken();
      const savedUser = getSessionUser();
      if (token && window.electronAPI?.authSetSession) {
        window.electronAPI.authSetSession(token, savedUser as unknown as Record<string, unknown>);
      }

      // Sync privacy settings to main process so it knows current values on startup
      window.electronAPI?.notifyCloudBackupChanged?.(
        localStorage.getItem("cloudBackupEnabled") === "true"
      );
      const retentionDays = parseInt(localStorage.getItem("audioRetentionDays") || "30", 10);
      window.electronAPI?.notifyAudioRetentionChanged?.(isNaN(retentionDays) ? 30 : retentionDays);
    }
  }, [isSignedIn, hasToken, gracePeriodActive, isLoaded]);

  return {
    isSignedIn,
    isLoaded,
    session: hasToken ? { token: true } : null,
    user,
  };
}
