export const hasStoredByokKey = () =>
  !!(
    localStorage.getItem("openaiApiKey") ||
    localStorage.getItem("groqApiKey") ||
    localStorage.getItem("mistralApiKey") ||
    localStorage.getItem("customTranscriptionApiKey")
  );

let lastSyncedByok: boolean | null = null;

export function syncByokStatus(): void {
  const isByok = hasStoredByokKey();
  if (isByok === lastSyncedByok) return;
  lastSyncedByok = isByok;

  if (window.electronAPI?.cloudUpdateByok) {
    window.electronAPI.cloudUpdateByok(isByok);
  }
}
