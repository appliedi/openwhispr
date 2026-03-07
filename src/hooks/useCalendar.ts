import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "./useAuth";
import type { CalendarConnection, CalendarEvent } from "../types/electron";

interface UseCalendarResult {
  connections: CalendarConnection[];
  events: CalendarEvent[];
  isLoading: boolean;
  error: string | null;
  connecting: boolean;
  connect: (platform: "google" | "microsoft") => Promise<void>;
  disconnect: (connectionId: string) => Promise<void>;
  updatePreferences: (prefs: Record<string, unknown>) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useCalendar(): UseCalendarResult {
  const { isSignedIn } = useAuth();
  const [connections, setConnections] = useState<CalendarConnection[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!window.electronAPI?.cloudCalendarStatus) return;
    try {
      const result = await window.electronAPI.cloudCalendarStatus();
      if (result.success && result.connections) {
        setConnections(result.connections);
      }
    } catch {
      // non-critical
    }
  }, []);

  const fetchEvents = useCallback(async () => {
    if (!window.electronAPI?.cloudCalendarEvents) return;
    try {
      const result = await window.electronAPI.cloudCalendarEvents();
      if (result.success && result.events) {
        setEvents(result.events);
      }
    } catch {
      // non-critical
    }
  }, []);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await Promise.all([fetchStatus(), fetchEvents()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch calendar data");
    } finally {
      setIsLoading(false);
    }
  }, [fetchStatus, fetchEvents]);

  useEffect(() => {
    if (!isSignedIn) return;
    refetch();
  }, [isSignedIn, refetch]);

  const connect = useCallback(
    async (platform: "google" | "microsoft") => {
      if (!window.electronAPI?.cloudCalendarConnect || !window.electronAPI?.openExternal) return;
      setConnecting(true);
      setError(null);

      try {
        const result = await window.electronAPI.cloudCalendarConnect(platform);
        if (!result.success || !result.oauth_url) {
          throw new Error(result.error || "Failed to get OAuth URL");
        }

        await window.electronAPI.openExternal(result.oauth_url);

        // Poll for connection completion (every 3s for up to 3 min)
        let attempts = 0;
        const maxAttempts = 60;
        pollRef.current = setInterval(async () => {
          attempts++;
          const statusResult = await window.electronAPI!.cloudCalendarStatus!();
          if (
            statusResult.success &&
            statusResult.connections &&
            statusResult.connections.length > connections.length
          ) {
            setConnections(statusResult.connections);
            setConnecting(false);
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            await fetchEvents();
          }
          if (attempts >= maxAttempts) {
            setConnecting(false);
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }, 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to connect calendar");
        setConnecting(false);
      }
    },
    [connections.length, fetchEvents]
  );

  const disconnect = useCallback(async (connectionId: string) => {
    if (!window.electronAPI?.cloudCalendarDisconnect) return;
    try {
      const result = await window.electronAPI.cloudCalendarDisconnect(connectionId);
      if (result.success) {
        setConnections((prev) => prev.filter((c) => c.id !== connectionId));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect");
    }
  }, []);

  const updatePreferences = useCallback(async (prefs: Record<string, unknown>) => {
    if (!window.electronAPI?.cloudCalendarPreferences) return;
    try {
      await window.electronAPI.cloudCalendarPreferences(prefs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update preferences");
    }
  }, []);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  return {
    connections,
    events,
    isLoading,
    error,
    connecting,
    connect,
    disconnect,
    updatePreferences,
    refetch,
  };
}
