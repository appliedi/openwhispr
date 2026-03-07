import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

interface WhatsNewProps {
  onClose: () => void;
}

export default function WhatsNew({ onClose }: WhatsNewProps) {
  const { t } = useTranslation();
  const [version, setVersion] = useState("");
  const [changelog, setChangelog] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const result = await window.electronAPI?.getAppVersion?.();
      const appVersion = result?.version;
      if (!appVersion) return;
      setVersion(appVersion);

      const lastSeen = localStorage.getItem("lastSeenVersion");
      if (lastSeen === appVersion) {
        onClose();
        return;
      }

      try {
        const res = await fetch("/CHANGELOG.md");
        if (!res.ok) return;
        const text = await res.text();
        const entries = parseChangelog(text, appVersion);
        if (entries.length === 0) {
          localStorage.setItem("lastSeenVersion", appVersion);
          onClose();
          return;
        }
        setChangelog(entries);
      } catch {
        onClose();
      }
    })();
  }, [onClose]);

  function handleDismiss() {
    localStorage.setItem("lastSeenVersion", version);
    onClose();
  }

  if (changelog.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full mx-4 shadow-xl max-h-[70vh] flex flex-col">
        <h2 className="text-lg font-semibold mb-1">
          {t("whatsNew.title", { defaultValue: "What's New" })}
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          {t("whatsNew.version", { version, defaultValue: `Version ${version}` })}
        </p>
        <div className="flex-1 overflow-y-auto space-y-2 mb-4">
          {changelog.map((entry, i) => (
            <div key={i} className="flex gap-2 text-sm">
              <span className="text-primary mt-0.5 flex-shrink-0">•</span>
              <span>{entry}</span>
            </div>
          ))}
        </div>
        <button
          onClick={handleDismiss}
          className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90"
        >
          {t("whatsNew.dismiss", { defaultValue: "Got it" })}
        </button>
      </div>
    </div>
  );
}

function parseChangelog(markdown: string, version: string): string[] {
  const versionHeader = `## [${version}]`;
  const startIdx = markdown.indexOf(versionHeader);
  if (startIdx === -1) return [];

  const afterHeader = markdown.indexOf("\n", startIdx);
  const nextSection = markdown.indexOf("\n## [", afterHeader + 1);
  const section =
    nextSection === -1 ? markdown.slice(afterHeader) : markdown.slice(afterHeader, nextSection);

  const entries: string[] = [];
  for (const line of section.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ")) {
      const text = trimmed
        .slice(2)
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .trim();
      if (text) entries.push(text);
    }
  }
  return entries;
}
