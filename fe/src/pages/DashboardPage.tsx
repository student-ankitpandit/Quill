import { useCallback, useEffect, useState } from "react";
import { navigate } from "@/lib/router";
import { AppSidebar } from "@/components/AppSidebar";
import {
  listSessions,
  type SessionSummary,
} from "./apiPage";
import NewSession from "./NewSessionPage";
import Settings from "./SettingsPage";

type View = "new" | "settings";

export default function Dashboard({ onLogout, initialView = "new" }: { onLogout?: () => void; initialView?: View }) {
  const [view, setView] = useState<View>(initialView);
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setSessions(await listSessions());
      setLoadError(false);
    } catch {
      setLoadError(true);
      setSessions((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  const go = (next: View) => {
    setView(next);
    setMenuOpen(false);
    navigate(next === "settings" ? { page: "settings" } : { page: "dashboard" });
  };

  return (
    <div className="app">
      <AppSidebar
        sessions={sessions}
        loadError={loadError}
        settingsActive={view === "settings"}
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen((open) => !open)}
        onNewSession={() => go("new")}
        onSettings={() => go("settings")}
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
      </main>
    </div>
  );
}
