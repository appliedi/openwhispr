import React, { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Video,
  Loader2,
  Search,
  Play,
  Square,
  Trash2,
  Download,
  Clock,
  Users,
  FileText,
  ExternalLink,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { useCloudMeetings } from "../hooks/useCloudMeetings";
import { useAuth } from "../hooks/useAuth";
import { ConfirmDialog } from "./ui/dialog";
import { useDialogs } from "../hooks/useDialogs";
import type { CloudMeeting, MeetingSegment } from "../types/electron";

export default function CloudMeetingsView() {
  const { t } = useTranslation();
  const { isSignedIn } = useAuth();
  const {
    meetings,
    isLoading,
    error,
    hasMore,
    fetchMeetings,
    fetchMore,
    getTranscript,
    getRecordingUrl,
    createMeeting,
    stopMeeting,
    deleteMeeting,
  } = useCloudMeetings();
  const { confirmDialog, showConfirmDialog, hideConfirmDialog } = useDialogs();

  const [meetingUrl, setMeetingUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<CloudMeeting | null>(null);
  const [transcript, setTranscript] = useState<MeetingSegment[]>([]);
  const [loadingTranscript, setLoadingTranscript] = useState(false);

  useEffect(() => {
    if (isSignedIn) fetchMeetings();
  }, [isSignedIn, fetchMeetings]);

  const handleCreate = async () => {
    if (!meetingUrl.trim()) return;
    setCreating(true);
    const result = await createMeeting(meetingUrl.trim());
    if (result.success) setMeetingUrl("");
    setCreating(false);
  };

  const handleSelectMeeting = useCallback(
    async (meeting: CloudMeeting) => {
      setSelectedMeeting(meeting);
      setLoadingTranscript(true);
      const segments = await getTranscript(meeting.id);
      setTranscript(segments);
      setLoadingTranscript(false);
    },
    [getTranscript]
  );

  const handleDownload = async (meetingId: string) => {
    const url = await getRecordingUrl(meetingId);
    if (url && window.electronAPI?.openExternal) {
      await window.electronAPI.openExternal(url);
    }
  };

  const handleDelete = (meetingId: string) => {
    showConfirmDialog({
      title: t("cloudMeetings.deleteConfirm"),
      variant: "destructive",
      onConfirm: () => {
        deleteMeeting(meetingId);
        if (selectedMeeting?.id === meetingId) {
          setSelectedMeeting(null);
          setTranscript([]);
        }
      },
    });
  };

  const statusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      recording: "default",
      done: "secondary",
      fatal: "destructive",
    };
    const labels: Record<string, string> = {
      recording: t("cloudMeetings.recording"),
      in_call_recording: t("cloudMeetings.recording"),
      joining_call: t("cloudMeetings.joining"),
      done: t("cloudMeetings.completed"),
      fatal: t("cloudMeetings.error"),
      media_expired: t("cloudMeetings.error"),
      analysis_done: t("cloudMeetings.completed"),
    };
    return (
      <Badge variant={variants[status] || "outline"} className="text-[10px]">
        {labels[status] || status}
      </Badge>
    );
  };

  if (selectedMeeting) {
    return (
      <div className="max-w-3xl mx-auto w-full px-4 py-4">
        <button
          onClick={() => {
            setSelectedMeeting(null);
            setTranscript([]);
          }}
          className="text-xs text-muted-foreground hover:text-foreground mb-3 flex items-center gap-1"
        >
          ← {t("cloudMeetings.title")}
        </button>

        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold">
              {selectedMeeting.title || selectedMeeting.platform}
            </h2>
            <p className="text-xs text-muted-foreground">
              {new Date(selectedMeeting.created_at).toLocaleString()}
              {selectedMeeting.duration_seconds != null && (
                <>
                  {" "}
                  ·{" "}
                  {t("cloudMeetings.duration", {
                    minutes: Math.round(selectedMeeting.duration_seconds / 60),
                  })}
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {statusBadge(selectedMeeting.status)}
            {selectedMeeting.recording_url && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleDownload(selectedMeeting.id)}
              >
                <Download size={14} className="mr-1" />
                {t("cloudMeetings.downloadRecording")}
              </Button>
            )}
            {["recording", "in_call_recording"].includes(selectedMeeting.status) && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => stopMeeting(selectedMeeting.id)}
              >
                <Square size={14} className="mr-1" />
                {t("cloudMeetings.stopRecording")}
              </Button>
            )}
          </div>
        </div>

        {/* Participants */}
        {selectedMeeting.participants && selectedMeeting.participants.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
              <Users size={12} /> {t("cloudMeetings.participants")}
            </h3>
            <div className="flex flex-wrap gap-1">
              {selectedMeeting.participants.map((p) => (
                <Badge key={p.id} variant="outline" className="text-xs">
                  {p.name}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Transcript */}
        <div>
          <h3 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
            <FileText size={12} /> {t("cloudMeetings.transcript")}
          </h3>
          {loadingTranscript ? (
            <div className="flex justify-center py-8">
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
            </div>
          ) : transcript.length > 0 ? (
            <div className="space-y-2">
              {transcript.map((seg) => (
                <div key={seg.id} className="text-sm">
                  {seg.participant_name && (
                    <span className="font-medium text-primary text-xs mr-1">
                      {seg.participant_name}:
                    </span>
                  )}
                  <span className="text-foreground/90">{seg.text}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">
              {t("cloudMeetings.noTranscript")}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto w-full px-4 py-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold">{t("cloudMeetings.title")}</h2>
      </div>

      {/* Record a Meeting */}
      <div className="flex gap-2 mb-4">
        <Input
          value={meetingUrl}
          onChange={(e) => setMeetingUrl(e.target.value)}
          placeholder={t("cloudMeetings.recordPlaceholder")}
          className="text-sm"
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        />
        <Button onClick={handleCreate} disabled={creating || !meetingUrl.trim()} size="sm">
          {creating ? (
            <Loader2 size={14} className="mr-1 animate-spin" />
          ) : (
            <Play size={14} className="mr-1" />
          )}
          {t("cloudMeetings.recordStart")}
        </Button>
      </div>

      {/* Meetings List */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
        </div>
      ) : meetings.length > 0 ? (
        <div className="space-y-2">
          {meetings.map((meeting) => (
            <button
              key={meeting.id}
              onClick={() => handleSelectMeeting(meeting)}
              className="w-full text-left rounded-lg border border-border/20 dark:border-white/8 p-3 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {meeting.title || meeting.meeting_url}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">
                      {new Date(meeting.created_at).toLocaleDateString()}
                    </span>
                    {meeting.duration_seconds != null && (
                      <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                        <Clock size={10} />
                        {t("cloudMeetings.duration", {
                          minutes: Math.round(meeting.duration_seconds / 60),
                        })}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground capitalize">
                      {meeting.platform}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-2">
                  {statusBadge(meeting.status)}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(meeting.id);
                    }}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            </button>
          ))}
          {hasMore && (
            <Button variant="ghost" size="sm" onClick={fetchMore} className="w-full text-xs">
              Load more
            </Button>
          )}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <Video size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm font-medium mb-1">{t("cloudMeetings.empty")}</p>
          <p className="text-xs">{t("cloudMeetings.emptyDescription")}</p>
        </div>
      )}

      {error && <p className="text-xs text-destructive mt-2">{error}</p>}

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => !open && hideConfirmDialog()}
        title={confirmDialog.title}
        description={confirmDialog.description}
        variant={confirmDialog.variant}
        confirmText={confirmDialog.confirmText}
        cancelText={confirmDialog.cancelText}
        onConfirm={confirmDialog.onConfirm}
        onCancel={hideConfirmDialog}
      />
    </div>
  );
}
