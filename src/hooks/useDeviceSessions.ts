import { useState, useCallback } from "react";
import { useAuth } from "./useAuth";
import type { DesktopSession } from "../types/electron";

interface UseDeviceSessionsResult {
  sessions: DesktopSession[];
  isLoading: boolean;
  error: string | null;
  fetchSessions: () => Promise<void>;
  revokeSession: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
}

export function useDeviceSessions(): UseDeviceSessionsResult {
  const { isSignedIn } = useAuth();
  const [sessions, setSessions] = useState<DesktopSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    if (!isSignedIn || !window.electronAPI?.cloudListSessions) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.cloudListSessions();
      if (result.success && result.sessions) {
        setSessions(result.sessions);
      } else {
        setError(result.error || "Failed to fetch sessions");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch sessions");
    } finally {
      setIsLoading(false);
    }
  }, [isSignedIn]);

  const revokeSession = useCallback(async (sessionId: string) => {
    if (!window.electronAPI?.cloudRevokeSession) return { success: false, error: "Not available" };
    const result = await window.electronAPI.cloudRevokeSession(sessionId);
    if (result.success) {
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    }
    return { success: result.success, error: result.error };
  }, []);

  return { sessions, isLoading, error, fetchSessions, revokeSession };
}
