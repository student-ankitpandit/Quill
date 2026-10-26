import "../../styles/dashboard.css";
import type { SessionStatus } from "@/lib/api";
import { navigate } from "@/lib/router";
import { QuillMark } from "@/components/QuillMark";
import { GitPullRequest, Menu, Plus } from "lucide-react";
import type { SessionSummary } from "@/pages/apiPage";

const statusLabels: Record<SessionStatus, string> = {
  ready: "Ready",
  running: "Running",
  waiting_for_input: "Needs your answer",
  done: "Done",
  error: "Failed",
  stopped: "Stopped",
};

type AppSidebarProps = {
  sessions: SessionSummary[] | null;
  loadError?: boolean;
  activeSessionId?: string;
  settingsActive?: boolean;
  reviewActive?: boolean;
  menuOpen?: boolean;
  onToggleMenu?: () => void;
  onNewSession: () => void;
  onSettings: () => void;
  onReview?: () => void;
  onLogout?: () => void;
};

export function AppSidebar({
  sessions,
  loadError = false,
  activeSessionId,
  settingsActive = false,
  reviewActive = false,
  menuOpen = false,
  onToggleMenu,
  onNewSession,
  onSettings,
  onReview,
  onLogout,
}: AppSidebarProps) {
  return (
    <>
      <header className="mobilebar">
        <button className="iconbtn" onClick={onToggleMenu} aria-label="Toggle menu">
          <Menu size={18} />
        </button>
        <span className="logo"><QuillMark size={17} /></span>
        <span className="brand-name">quill</span>
      </header>

      <aside className="sidebar" data-open={menuOpen}>
        <div className="brand">
          <span className="logo"><QuillMark size={17} /></span>
          <span className="brand-name">quill</span>
        </div>

        <button className="nav-item sidebar-action" onClick={onNewSession}>
          <Plus size={17} aria-hidden="true" />
          <span>New session</span>
        </button>

        <button
          className="nav-item sidebar-action"
          aria-current={reviewActive}
          onClick={onReview ?? (() => navigate({ page: "review" }))}
        >
          <GitPullRequest size={17} aria-hidden="true" />
          <span>Review</span>
        </button>

        <nav className="sessions" aria-label="Sessions">
          <p className="sidebar-label">Sessions</p>
          {sessions === null && <p className="muted small pad">Loading…</p>}
          {sessions?.length === 0 && (
            <p className="muted small pad">
              {loadError
                ? "Could not reach the server. Retrying…"
                : "No sessions yet. Describe a task to start one."}
            </p>
          )}
          {sessions?.map((session) => (
            <button
              key={session.id}
              className="session-item"
              aria-current={session.id === activeSessionId}
              onClick={() => navigate({ page: "session", sessionId: session.id })}
            >
              <span
                className={`dot dot-${session.status}`}
                title={statusLabels[session.status]}
                aria-label={statusLabels[session.status]}
              />
              <span className="session-text">
                <span className="session-title">{session.title || "Untitled session"}</span>
                <span className="session-repo">{session.repoFullName}</span>
              </span>
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <button className="nav-item" aria-current={settingsActive} onClick={onSettings}>
            Settings
          </button>
          {onLogout && <button className="nav-item" onClick={onLogout}>Log out</button>}
        </div>
      </aside>
    </>
  );
}
