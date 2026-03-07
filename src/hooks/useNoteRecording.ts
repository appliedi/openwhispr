import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import AudioManager from "../helpers/audioManager";
import logger from "../utils/logger";
import { getRecordingErrorTitle } from "../utils/recordingErrors";

interface SpeakerSegment {
  speaker: string;
  text: string;
  start: number | null;
  end: number | null;
}

interface UseNoteRecordingOptions {
  onTranscriptionComplete: (text: string, speakerSegments?: SpeakerSegment[]) => void;
  onPartialTranscript?: (text: string) => void;
  onDiarizedTranscript?: (segments: SpeakerSegment[]) => void;
  onError?: (error: { title: string; description: string }) => void;
  diarize?: boolean;
}

interface UseNoteRecordingReturn {
  isRecording: boolean;
  isProcessing: boolean;
  isStreaming: boolean;
  partialTranscript: string;
  streamingCommit: string | null;
  consumeStreamingCommit: () => void;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  cancelRecording: () => void;
}

export function useNoteRecording({
  onTranscriptionComplete,
  onPartialTranscript,
  onDiarizedTranscript,
  onError,
  diarize = false,
}: UseNoteRecordingOptions): UseNoteRecordingReturn {
  const { t } = useTranslation();
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState("");
  const [streamingCommits, setStreamingCommits] = useState<string[]>([]);
  const audioManagerRef = useRef<InstanceType<typeof AudioManager> | null>(null);

  const callbacksRef = useRef({
    onTranscriptionComplete,
    onPartialTranscript,
    onDiarizedTranscript,
    onError,
  });
  callbacksRef.current = {
    onTranscriptionComplete,
    onPartialTranscript,
    onDiarizedTranscript,
    onError,
  };

  useEffect(() => {
    const manager = new AudioManager();
    audioManagerRef.current = manager;
    manager.setSkipReasoning(true);

    manager.setCallbacks({
      onStateChange: ({
        isRecording,
        isProcessing,
        isStreaming,
      }: {
        isRecording: boolean;
        isProcessing: boolean;
        isStreaming?: boolean;
      }) => {
        setIsRecording(isRecording);
        setIsProcessing(isProcessing);
        setIsStreaming(isStreaming ?? false);
        if (!isStreaming) {
          setPartialTranscript("");
          setStreamingCommits([]);
        }
      },
      onError: (error: { title: string; description: string; code?: string }) => {
        const title = getRecordingErrorTitle(error, t);
        callbacksRef.current.onError?.({ title, description: error.description });
      },
      onPartialTranscript: (text: string) => {
        setPartialTranscript(text);
        callbacksRef.current.onPartialTranscript?.(text);
      },
      onStreamingCommit: (text: string) => {
        setStreamingCommits((pending) => [...pending, text]);
      },
      onTranscriptionComplete: (result: {
        success: boolean;
        text: string;
        source?: string;
        limitReached?: boolean;
        wordsUsed?: number;
        wordsRemaining?: number;
        speakerSegments?: SpeakerSegment[];
      }) => {
        if (result.success) {
          callbacksRef.current.onTranscriptionComplete(result.text, result.speakerSegments);
          if (manager.shouldUseStreaming()) {
            manager.warmupStreamingConnection();
          }
        }
      },
      onDiarizedTranscript: (segments: SpeakerSegment[]) => {
        callbacksRef.current.onDiarizedTranscript?.(segments);
      },
    });

    manager.setContext("notes");
    manager.setDiarize(diarize);
    window.electronAPI.getSttConfig?.().then((config) => {
      if (config && audioManagerRef.current) {
        audioManagerRef.current.setSttConfig(config);
        if (manager.shouldUseStreaming()) {
          manager.warmupStreamingConnection();
        }
      }
    });

    return () => {
      manager.cleanup();
      audioManagerRef.current = null;
    };
  }, []);

  useEffect(() => {
    audioManagerRef.current?.setDiarize(diarize);
  }, [diarize]);

  const startRecording = useCallback(async () => {
    const manager = audioManagerRef.current;
    if (!manager) return;

    const state = manager.getState();
    if (state.isRecording || state.isProcessing) return;

    const didStart = manager.shouldUseStreaming()
      ? await manager.startStreamingRecording()
      : await manager.startRecording();

    if (!didStart) {
      logger.debug("Note recording failed to start", {}, "notes");
    }
  }, []);

  const stopRecording = useCallback(async () => {
    const manager = audioManagerRef.current;
    if (!manager) return;

    const state = manager.getState();
    if (!state.isRecording) return;

    if (state.isStreaming) {
      await manager.stopStreamingRecording();
    } else {
      manager.stopRecording();
    }
  }, []);

  const cancelRecording = useCallback(() => {
    const manager = audioManagerRef.current;
    if (!manager) return;

    const state = manager.getState();
    if (state.isStreaming) {
      manager.stopStreamingRecording();
    } else {
      manager.cancelRecording();
    }
  }, []);

  const consumeStreamingCommit = useCallback(
    () => setStreamingCommits((pending) => pending.slice(1)),
    []
  );

  const streamingCommit = streamingCommits[0] ?? null;

  return {
    isRecording,
    isProcessing,
    isStreaming,
    partialTranscript,
    streamingCommit,
    consumeStreamingCommit,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
