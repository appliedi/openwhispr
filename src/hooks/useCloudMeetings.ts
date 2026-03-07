import { useState, useCallback } from "react";
import { useAuth } from "./useAuth";
import type { CloudMeeting, MeetingSegment } from "../types/electron";

interface UseCloudMeetingsResult {
  meetings: CloudMeeting[];
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  fetchMeetings: () => Promise<void>;
  fetchMore: () => Promise<void>;
  getMeeting: (id: string) => Promise<CloudMeeting | null>;
  getTranscript: (id: string) => Promise<MeetingSegment[]>;
  getRecordingUrl: (id: string) => Promise<string | null>;
  createMeeting: (meetingUrl: string) => Promise<{ success: boolean; error?: string }>;
  stopMeeting: (id: string) => Promise<{ success: boolean; error?: string }>;
  deleteMeeting: (id: string) => Promise<{ success: boolean; error?: string }>;
  searchMeetings: (
    query: string
  ) => Promise<Array<{ meeting: CloudMeeting; segments: MeetingSegment[] }>>;
}

export function useCloudMeetings(): UseCloudMeetingsResult {
  const { isSignedIn } = useAuth();
  const [meetings, setMeetings] = useState<CloudMeeting[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const fetchMeetings = useCallback(async () => {
    if (!isSignedIn || !window.electronAPI?.cloudMeetingsList) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.cloudMeetingsList({ limit: 20 });
      if (result.success && result.meetings) {
        setMeetings(result.meetings);
        setHasMore(result.meetings.length === 20);
      } else {
        setError(result.error || "Failed to fetch meetings");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch meetings");
    } finally {
      setIsLoading(false);
    }
  }, [isSignedIn]);

  const fetchMore = useCallback(async () => {
    if (!isSignedIn || !window.electronAPI?.cloudMeetingsList || meetings.length === 0) return;
    const lastMeeting = meetings[meetings.length - 1];
    try {
      const result = await window.electronAPI.cloudMeetingsList({
        limit: 20,
        before: lastMeeting.created_at,
      });
      if (result.success && result.meetings) {
        setMeetings((prev) => [...prev, ...result.meetings!]);
        setHasMore(result.meetings.length === 20);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch more meetings");
    }
  }, [isSignedIn, meetings]);

  const getMeeting = useCallback(async (id: string): Promise<CloudMeeting | null> => {
    if (!window.electronAPI?.cloudMeetingGet) return null;
    const result = await window.electronAPI.cloudMeetingGet(id);
    return result.success ? (result.meeting ?? null) : null;
  }, []);

  const getTranscript = useCallback(async (id: string): Promise<MeetingSegment[]> => {
    if (!window.electronAPI?.cloudMeetingTranscript) return [];
    const result = await window.electronAPI.cloudMeetingTranscript(id);
    return result.success ? (result.segments ?? []) : [];
  }, []);

  const getRecordingUrl = useCallback(async (id: string): Promise<string | null> => {
    if (!window.electronAPI?.cloudMeetingRecording) return null;
    const result = await window.electronAPI.cloudMeetingRecording(id);
    return result.success ? (result.url ?? null) : null;
  }, []);

  const createMeeting = useCallback(async (meetingUrl: string) => {
    if (!window.electronAPI?.cloudMeetingCreate) return { success: false, error: "Not available" };
    const result = await window.electronAPI.cloudMeetingCreate(meetingUrl);
    if (result.success && result.meeting) {
      setMeetings((prev) => [result.meeting!, ...prev]);
    }
    return { success: result.success, error: result.error };
  }, []);

  const stopMeeting = useCallback(async (id: string) => {
    if (!window.electronAPI?.cloudMeetingStop) return { success: false, error: "Not available" };
    const result = await window.electronAPI.cloudMeetingStop(id);
    if (result.success) {
      setMeetings((prev) => prev.map((m) => (m.id === id ? { ...m, status: "done" } : m)));
    }
    return { success: result.success, error: result.error };
  }, []);

  const deleteMeeting = useCallback(async (id: string) => {
    if (!window.electronAPI?.cloudMeetingDelete) return { success: false, error: "Not available" };
    const result = await window.electronAPI.cloudMeetingDelete(id);
    if (result.success) {
      setMeetings((prev) => prev.filter((m) => m.id !== id));
    }
    return { success: result.success, error: result.error };
  }, []);

  const searchMeetings = useCallback(async (query: string) => {
    if (!window.electronAPI?.cloudMeetingsSearch) return [];
    const result = await window.electronAPI.cloudMeetingsSearch(query);
    return result.success ? (result.results ?? []) : [];
  }, []);

  return {
    meetings,
    isLoading,
    error,
    hasMore,
    fetchMeetings,
    fetchMore,
    getMeeting,
    getTranscript,
    getRecordingUrl,
    createMeeting,
    stopMeeting,
    deleteMeeting,
    searchMeetings,
  };
}
