import { useCallback, useEffect, useState } from "react";
import { navigate } from "@/lib/router";
import { AppSidebar } from "@/components/AppSidebar";
import {
  listSessions,
  type SessionSummary,
} from "./apiPage";
import { getInstallationId } from "@/lib/api";
import NewSession from "./NewSessionPage";
import Settings from "./SettingsPage";
import ReviewPage from "./ReviewPage";

type View = "new" | "settings" | "review";
function sameSessionSummaries(a: SessionSummary[], b: SessionSummary[]) {
  return a.length === b.length && a.every((session, index) => {
    const next = b[index];
    return session.id === next.id && session.title === next.title &&
      session.repoFullName === next.repoFullName && session.status === next.status &&
      session.prUrl === next.prUrl && session.prMergedAt === next.prMergedAt &&
      session.prBaseBranch === next.prBaseBranch;
  });
}

export default function Dashboard({ onLogout, initialView = "new" }: { onLogout?: () => void; initialView?: View }) {
  const installationId = getInstallationId();
  const [view, setView] = useState<View>(initialView);
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await listSessions(true);
      setSessions((current) => current && sameSessionSummaries(current, next) ? current : next);
      setLoadError(false);
    } catch {
      setLoadError(true);
      setSessions((prev) => prev ?? []);
    }
  }, [installationId]);

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 20_000);
    const refreshOnVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", refreshOnVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", refreshOnVisible);
    };
  }, [refresh]);

  const go = (next: View) => {
    setView(next);
    setMenuOpen(false);
    navigate(next === "settings" ? { page: "settings" } : next === "review" ? { page: "review" } : { page: "dashboard" });
  };

  return (
    <div className="app">
      <AppSidebar
        sessions={sessions}
        loadError={loadError}
        settingsActive={view === "settings"}
        reviewActive={view === "review"}
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen((open) => !open)}
        onNewSession={() => go("new")}
        onSettings={() => go("settings")}
        onReview={() => go("review")}
        onLogout={onLogout}
      />

      <main className="main">
        {view === "new" && (
          <NewSession
            onCreated={(s) => {
              refresh();
              navigate({ page: "session", sessionId: s.id });
            }}
          />
        )}
        {view === "settings" && <Settings />}
        {view === "review" && <ReviewPage sessions={sessions} loadError={loadError} />}
      </main>
    </div>
  );
}
