const debugLogger = require("./debugLogger");

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

class NotesSyncService {
  constructor(database, getApiUrl, getAuthHeader) {
    this.db = database;
    this.getApiUrl = getApiUrl;
    this.getAuthHeader = getAuthHeader;
    this.timer = null;
    this.syncing = false;
    this.lastSyncAt = null;
    this.listeners = [];
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.sync(), SYNC_INTERVAL_MS);
    debugLogger.info("Notes sync service started", {}, "notes-sync");
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    debugLogger.info("Notes sync service stopped", {}, "notes-sync");
  }

  onSyncEvent(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  _emit(event) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // ignore listener errors
      }
    }
  }

  async sync() {
    if (this.syncing) return { success: true, skipped: true };

    const apiUrl = this.getApiUrl();
    const authHeader = this.getAuthHeader();
    if (!apiUrl || !authHeader) {
      return { success: false, error: "Not authenticated" };
    }

    this.syncing = true;
    this._emit({ type: "sync-start" });

    const result = { pushed: 0, pulled: 0, deleted: 0, errors: [] };

    try {
      await this._pushNewNotes(apiUrl, authHeader, result);
      await this._pushUpdatedNotes(apiUrl, authHeader, result);
      await this._deleteCloudNotes(apiUrl, authHeader, result);
      await this._pullCloudNotes(apiUrl, authHeader, result);

      this.lastSyncAt = new Date().toISOString();
      this._emit({ type: "sync-complete", result });
      debugLogger.info("Notes sync complete", result, "notes-sync");
      return { success: true, ...result };
    } catch (error) {
      debugLogger.error("Notes sync failed", { error: error.message }, "notes-sync");
      this._emit({ type: "sync-error", error: error.message });
      return { success: false, error: error.message };
    } finally {
      this.syncing = false;
    }
  }

  async _pushNewNotes(apiUrl, authHeader, result) {
    const unsynced = this.db.getUnsyncedNotes();
    if (unsynced.length === 0) return;

    const notes = unsynced.map((n) => ({
      client_note_id: String(n.id),
      title: n.title,
      content: n.content,
      enhanced_content: n.enhanced_content,
      enhancement_prompt: n.enhancement_prompt,
      note_type: n.note_type,
      source_file: n.source_file,
      audio_duration_seconds: n.audio_duration_seconds,
      created_at: n.created_at,
      updated_at: n.updated_at,
    }));

    // Batch in groups of 25
    for (let i = 0; i < notes.length; i += 25) {
      const batch = notes.slice(i, i + 25);
      const batchUnsynced = unsynced.slice(i, i + 25);

      try {
        const response = await fetch(`${apiUrl}/api/notes/batch-create`, {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ notes: batch }),
        });

        if (!response.ok) {
          if (response.status === 401) throw new Error("AUTH_EXPIRED");
          throw new Error(`Push failed: ${response.status}`);
        }

        const data = await response.json();
        if (data.created) {
          for (const created of data.created) {
            const localNote = batchUnsynced.find((n) => String(n.id) === created.client_note_id);
            if (localNote) {
              this.db.markNoteSynced(localNote.id, created.id);
              result.pushed++;
            }
          }
        }
      } catch (error) {
        result.errors.push(`Push batch error: ${error.message}`);
      }
    }
  }

  async _pushUpdatedNotes(apiUrl, authHeader, result) {
    const updated = this.db.getNotesUpdatedSince();
    if (updated.length === 0) return;

    for (const note of updated) {
      try {
        const response = await fetch(`${apiUrl}/api/notes/update`, {
          method: "PATCH",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: note.cloud_id,
            title: note.title,
            content: note.content,
            enhanced_content: note.enhanced_content,
          }),
        });

        if (!response.ok) {
          if (response.status === 401) throw new Error("AUTH_EXPIRED");
          result.errors.push(`Update note ${note.id} failed: ${response.status}`);
          continue;
        }

        this.db.markNoteSynced(note.id, note.cloud_id);
        result.pushed++;
      } catch (error) {
        if (error.message === "AUTH_EXPIRED") throw error;
        result.errors.push(`Update note ${note.id}: ${error.message}`);
      }
    }
  }

  async _deleteCloudNotes(apiUrl, authHeader, result) {
    const deleted = this.db.getDeletedNotes();
    if (deleted.length === 0) return;

    for (const note of deleted) {
      try {
        const response = await fetch(`${apiUrl}/api/notes/delete`, {
          method: "DELETE",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ id: note.cloud_id }),
        });

        if (response.ok || response.status === 404) {
          // Hard delete locally after cloud deletion
          this.db.hardDeleteNote(note.id);
          result.deleted++;
        } else if (response.status === 401) {
          throw new Error("AUTH_EXPIRED");
        }
      } catch (error) {
        if (error.message === "AUTH_EXPIRED") throw error;
        result.errors.push(`Delete note ${note.id}: ${error.message}`);
      }
    }
  }

  async _pullCloudNotes(apiUrl, authHeader, result) {
    let before = null;
    let hasMore = true;

    while (hasMore) {
      try {
        const params = new URLSearchParams({ limit: "50" });
        if (before) params.set("before", before);

        const response = await fetch(`${apiUrl}/api/notes/list?${params}`, {
          headers: { Authorization: authHeader },
        });

        if (!response.ok) {
          if (response.status === 401) throw new Error("AUTH_EXPIRED");
          throw new Error(`Pull failed: ${response.status}`);
        }

        const data = await response.json();
        const notes = data.notes || [];

        if (notes.length === 0) {
          hasMore = false;
          break;
        }

        for (const cloudNote of notes) {
          const upsertResult = this.db.upsertNoteFromCloud(cloudNote);
          if (upsertResult.action === "created" || upsertResult.action === "updated") {
            result.pulled++;
          }
        }

        before = notes[notes.length - 1].created_at;
        hasMore = notes.length === 50;
      } catch (error) {
        if (error.message === "AUTH_EXPIRED") throw error;
        result.errors.push(`Pull error: ${error.message}`);
        hasMore = false;
      }
    }
  }

  getStatus() {
    return {
      syncing: this.syncing,
      lastSyncAt: this.lastSyncAt,
      running: !!this.timer,
    };
  }
}

module.exports = NotesSyncService;
