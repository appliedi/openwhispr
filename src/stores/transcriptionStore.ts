import { create } from "zustand";
import type { TranscriptionItem } from "../types/electron";

interface TranscriptionState {
  transcriptions: TranscriptionItem[];
  hasMore: boolean;
}

const useTranscriptionStore = create<TranscriptionState>()(() => ({
  transcriptions: [],
  hasMore: true,
}));

let hasBoundIpcListeners = false;
const DEFAULT_LIMIT = 50;
let currentLimit = DEFAULT_LIMIT;

function ensureIpcListeners() {
  if (hasBoundIpcListeners || typeof window === "undefined") {
    return;
  }

  const disposers: Array<() => void> = [];

  if (window.electronAPI?.onTranscriptionAdded) {
    const dispose = window.electronAPI.onTranscriptionAdded((item) => {
      if (item) {
        addTranscription(item);
      }
    });
    if (typeof dispose === "function") {
      disposers.push(dispose);
    }
  }

  if (window.electronAPI?.onTranscriptionDeleted) {
    const dispose = window.electronAPI.onTranscriptionDeleted(({ id }) => {
      removeTranscription(id);
    });
    if (typeof dispose === "function") {
      disposers.push(dispose);
    }
  }

  if (window.electronAPI?.onTranscriptionsCleared) {
    const dispose = window.electronAPI.onTranscriptionsCleared(() => {
      clearTranscriptions();
    });
    if (typeof dispose === "function") {
      disposers.push(dispose);
    }
  }

  hasBoundIpcListeners = true;

  window.addEventListener("beforeunload", () => {
    disposers.forEach((dispose) => dispose());
  });
}

export async function initializeTranscriptions(limit = DEFAULT_LIMIT) {
  currentLimit = limit;
  ensureIpcListeners();
  const items = await window.electronAPI.getTranscriptions(limit);
  useTranscriptionStore.setState({ transcriptions: items, hasMore: items.length >= limit });
  return items;
}

export async function loadMoreTranscriptions() {
  const { transcriptions, hasMore } = useTranscriptionStore.getState();
  if (!hasMore) return [];
  const items = await window.electronAPI.getTranscriptions(DEFAULT_LIMIT, transcriptions.length);
  useTranscriptionStore.setState({
    transcriptions: [...transcriptions, ...items],
    hasMore: items.length >= DEFAULT_LIMIT,
  });
  return items;
}

export function addTranscription(item: TranscriptionItem) {
  if (!item) return;
  const { transcriptions } = useTranscriptionStore.getState();
  const withoutDuplicate = transcriptions.filter((existing) => existing.id !== item.id);
  useTranscriptionStore.setState({
    transcriptions: [item, ...withoutDuplicate].slice(0, currentLimit),
  });
}

export function removeTranscription(id: number) {
  if (id == null) return;
  const { transcriptions } = useTranscriptionStore.getState();
  const next = transcriptions.filter((item) => item.id !== id);
  if (next.length === transcriptions.length) return;
  useTranscriptionStore.setState({ transcriptions: next });
}

export function updateTranscription(item: TranscriptionItem) {
  if (!item) return;
  const { transcriptions } = useTranscriptionStore.getState();
  const next = transcriptions.map((existing) => (existing.id === item.id ? item : existing));
  useTranscriptionStore.setState({ transcriptions: next });
}

export function clearTranscriptions() {
  if (useTranscriptionStore.getState().transcriptions.length === 0) return;
  useTranscriptionStore.setState({ transcriptions: [] });
}

export function useTranscriptions() {
  return useTranscriptionStore((state) => state.transcriptions);
}

export function useHasMoreTranscriptions() {
  return useTranscriptionStore((state) => state.hasMore);
}
