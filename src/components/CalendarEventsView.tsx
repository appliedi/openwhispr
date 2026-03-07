import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays, ExternalLink, Video, Loader2, Unplug } from "lucide-react";
import { Button } from "./ui/button";
import { useCalendar } from "../hooks/useCalendar";
import { useAuth } from "../hooks/useAuth";
import { ConfirmDialog } from "./ui/dialog";
import { useDialogs } from "../hooks/useDialogs";

export default function CalendarEventsView() {
  const { t } = useTranslation();
  const { isSignedIn } = useAuth();
  const { connections, events, isLoading, error, connecting, connect, disconnect, refetch } =
    useCalendar();
  const { confirmDialog, showConfirmDialog, hideConfirmDialog } = useDialogs();

  useEffect(() => {
    if (isSignedIn) refetch();
  }, [isSignedIn, refetch]);

  const handleDisconnect = (connectionId: string) => {
    showConfirmDialog({
      title: t("calendar.disconnectConfirm"),
      onConfirm: () => disconnect(connectionId),
      confirmText: t("calendar.disconnect"),
      variant: "destructive",
    });
  };

  const handleJoin = async (url: string) => {
    if (window.electronAPI?.openExternal) {
      await window.electronAPI.openExternal(url);
    }
  };

  return (
    <div className="max-w-3xl mx-auto w-full px-4 py-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold">{t("calendar.title")}</h2>
      </div>

      {/* Connected Calendars */}
      <div className="mb-6">
        {connections.length > 0 ? (
          <div className="space-y-2 mb-3">
            {connections.map((conn) => (
              <div
                key={conn.id}
                className="flex items-center justify-between rounded-lg border border-border/20 dark:border-white/8 p-3"
              >
                <div className="flex items-center gap-2">
                  <CalendarDays size={16} className="text-primary" />
                  <div>
                    <p className="text-sm font-medium">{conn.email}</p>
                    <p className="text-xs text-muted-foreground capitalize">{conn.platform}</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDisconnect(conn.id)}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  <Unplug size={14} className="mr-1" />
                  {t("calendar.disconnect")}
                </Button>
              </div>
            ))}
          </div>
        ) : (
          !isLoading && (
            <div className="text-center py-8 text-muted-foreground">
              <CalendarDays size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium mb-1">{t("calendar.noConnections")}</p>
              <p className="text-xs mb-4">{t("calendar.noConnectionsDescription")}</p>
            </div>
          )
        )}

        <div className="flex gap-2">
          <Button
            onClick={() => connect("google")}
            disabled={connecting}
            size="sm"
            variant="outline"
            className="text-xs"
          >
            {connecting ? <Loader2 size={14} className="mr-1 animate-spin" /> : null}
            {t("calendar.connectGoogle")}
          </Button>
          <Button
            onClick={() => connect("microsoft")}
            disabled={connecting}
            size="sm"
            variant="outline"
            className="text-xs"
          >
            {t("calendar.connectMicrosoft")}
          </Button>
        </div>
        {connecting && (
          <p className="text-xs text-muted-foreground mt-2">{t("calendar.oauthInstructions")}</p>
        )}
      </div>

      {/* Upcoming Events */}
      {connections.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-3">{t("calendar.upcomingEvents")}</h3>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
            </div>
          ) : events.length > 0 ? (
            <div className="space-y-2">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="rounded-lg border border-border/20 dark:border-white/8 p-3"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{event.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(event.start_time).toLocaleString(undefined, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                        {" – "}
                        {new Date(event.end_time).toLocaleTimeString(undefined, {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                      {event.attendees.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {event.attendees.map((a) => a.name || a.email).join(", ")}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      {event.auto_record && (
                        <span title={t("calendar.autoRecord")}>
                          <Video size={14} className="text-primary" />
                        </span>
                      )}
                      {event.meeting_url && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-7"
                          onClick={() => handleJoin(event.meeting_url!)}
                        >
                          <ExternalLink size={12} className="mr-1" />
                          {t("calendar.join")}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">
              {t("calendar.noEvents")}
            </p>
          )}
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
