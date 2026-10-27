import { useCallback, useEffect, useRef, useState } from "react";
import { getInstallUrl, getPlanUsage, type PlanUsage } from "@/lib/api";
import {
  createSession,
  listRepos,
  type Repo,
  type SessionSummary,
} from "./apiPage";

type SpeechResultEvent = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    [index: number]: { transcript: string };
  }>;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export default function NewSession({
  onCreated,
}: {
  onCreated: (s: SessionSummary) => void;
}) {
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [repo, setRepo] = useState("");
  const [task, setTask] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [planUsage, setPlanUsage] = useState<PlanUsage | null>(null);
  const [listening, setListening] = useState(false);
  const taskInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [voiceSupported] = useState(
    () =>
      typeof window !== "undefined" &&
      Boolean(
        (
          window as Window &
            typeof globalThis & {
              SpeechRecognition?: SpeechRecognitionConstructor;
              webkitSpeechRecognition?: SpeechRecognitionConstructor;
            }
        ).SpeechRecognition ||
        (
          window as Window &
            typeof globalThis & {
              webkitSpeechRecognition?: SpeechRecognitionConstructor;
            }
        ).webkitSpeechRecognition,
      ),
  );
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceBaseRef = useRef("");
  const voiceTranscriptRef = useRef("");

  const loadRepos = useCallback(async (forceRefresh = false) => {
    setError("");
    try {
      const r = await listRepos(forceRefresh);
      setRepos(r);
      const preferredRepo = r.find((candidate) => {
        const name = candidate.name || candidate.full_name.split("/").pop() || "";
        return name.toLocaleLowerCase().replace(/[^a-z0-9]/g, "") === "bmoredis";
      });
      if (preferredRepo) setRepo(preferredRepo.full_name);
      else if (r.length === 1) setRepo(r[0].full_name);
    } catch (e: any) {
      setRepos([]);
      setError(e.message === "Failed to fetch"
        ? "Could not reach Quill’s server. Check that it’s running, then retry."
        : e.message);
    }
  }, []);

  useEffect(() => {
    void loadRepos();
  }, [loadRepos]);

  useEffect(() => {
    void getPlanUsage().then(setPlanUsage).catch(() => setPlanUsage(null));
  }, []);

  useEffect(() => {
    const refreshWhenReturning = () => void loadRepos(true);
    const refreshAfterAuthChanges = (event: StorageEvent) => {
      if (event.key === "quill_token" || event.key === "quill_installation_id") {
        void loadRepos(true);
      }
    };

    window.addEventListener("focus", refreshWhenReturning);
    window.addEventListener("storage", refreshAfterAuthChanges);
    return () => {
      window.removeEventListener("focus", refreshWhenReturning);
      window.removeEventListener("storage", refreshAfterAuthChanges);
    };
  }, [loadRepos]);

  useEffect(() => {
    if (!repos?.length || !task.trim()) return;
    const normalizedTask = task.toLocaleLowerCase();
    const explicitMatch = repos.find((candidate) =>
      normalizedTask.includes(candidate.full_name.toLocaleLowerCase()),
    );
    if (explicitMatch) {
      setRepo(explicitMatch.full_name);
      return;
    }

    const nameMatches = repos.filter((candidate) => {
      const parts = candidate.full_name.split("/");
      const name = parts[parts.length - 1]?.toLocaleLowerCase();
      if (!name || name.length < 3) return false;
      const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(
        `(^|[^a-z0-9_.-])${escapedName}([^a-z0-9_.-]|$)`,
        "i",
      ).test(task);
    });
    if (nameMatches.length === 1) setRepo(nameMatches[0].full_name);
  }, [repos, task]);

  useEffect(() => {
    return () => recognitionRef.current?.stop();
  }, []);

  function toggleVoice() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const speechWindow = window as Window &
      typeof globalThis & {
        SpeechRecognition?: SpeechRecognitionConstructor;
        webkitSpeechRecognition?: SpeechRecognitionConstructor;
      };
    const SpeechRecognition =
      speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";
    voiceBaseRef.current = task.trim();
    voiceTranscriptRef.current = "";
    recognition.onresult = (event) => {
      let finalText = voiceTranscriptRef.current;
      let interimText = "";
      for (
        let index = event.resultIndex;
        index < event.results.length;
        index += 1
      ) {
        const text = event.results[index][0].transcript;
        if (event.results[index].isFinal) finalText += `${text} `;
        else interimText += text;
      }
      voiceTranscriptRef.current = finalText;
      setTask(`${voiceBaseRef.current} ${finalText}${interimText}`.trim());
    };
    recognition.onerror = (event) => {
      if (event.error !== "aborted")
        setError("Voice input could not be started.");
      setListening(false);
    };
    recognition.onend = () => {
      setListening(false);
      // The Speak button starts recognition, but dictated text should remain
      // ready for the normal Enter-to-submit keyboard flow.
      taskInputRef.current?.focus();
    };
    recognitionRef.current = recognition;
    setError("");
    setListening(true);
    recognition.start();
    taskInputRef.current?.focus();
  }

  const canSubmit = !busy && !!repo && task.trim().length > 0 && !!planUsage?.active && planUsage.remaining > 0;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      // Cloning the repo into a sandbox can take a while, so the button shows progress.
      const session = await createSession({
        repoFullName: repo,
        task: task.trim() || undefined,
      });
      onCreated(session);
    } catch (e: any) {
      setError(e.message || "Could not start the session.");
      setBusy(false);
    }
  }

  if (repos && repos.length === 0 && !error) {
    return (
      <section className="center">
        <h1 className="display">Give Quill a repository</h1>
        <p className="lede">
          Quill can only work in repositories you grant to the GitHub App.
        </p>
        <a
          className="btn btn-primary"
          href={getInstallUrl()}
          target="_blank"
          rel="noreferrer"
        >
          Choose repositories
        </a>
        <button className="btn btn-quiet" type="button" onClick={() => void loadRepos(true)}>
          Refresh repositories
        </button>
      </section>
    );
  }

  return (
    <section className="center">
      <h1 className="display">What should Quill work on?</h1>
      <p className="lede">
        Pick a repository, describe the change, and Quill opens a pull request.
      </p>
      <p className="plan-usage">
        {!planUsage
          ? "Checking your plan…"
          : !planUsage.active
            ? <>An active plan is required to start agent runs. <a href="/#pricing">View plans</a>.</>
            : planUsage.plan === "free"
              ? <>Free trial · {planUsage.used} of {planUsage.limit} agent runs used · {planUsage.remaining} remaining{planUsage.remaining === 0 && <> · <a href="/#pricing">Choose a paid plan</a></>}</>
              : `${planUsage.plan === "basic" ? "Basic" : "Pro"} plan · ${planUsage.used} of ${planUsage.limit} monthly agent runs used · ${planUsage.remaining} remaining`}
      </p>

      <div className="composer">
        <textarea
          ref={taskInputRef}
          value={task}
          onChange={(e) => setTask(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.repeat &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              if (canSubmit) void submit();
            }
          }}
          placeholder="Describe a bug to fix or a change to make"
          rows={4}
          disabled={busy}
          aria-label="Task"
        />
        <div className="composer-bar">
          <select
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            disabled={busy || !repos}
            aria-label="Repository"
          >
            {repos && repos.length > 1 && (
              <option value="">Choose a repository…</option>
            )}
            {!repos && <option>Loading repositories…</option>}
            {repos?.map((r) => (
              <option key={r.full_name} value={r.full_name}>
                {r.name ? `${r.name} — ${r.full_name}` : r.full_name}
              </option>
            ))}
          </select>
          {voiceSupported && (
            <button
              className={`voice-button push${listening ? " voice-button-active" : ""}`}
              type="button"
              onClick={toggleVoice}
              disabled={busy}
              aria-label={listening ? "Stop voice input" : "Start voice input"}
              aria-pressed={listening}
              title={listening ? "Stop voice input" : "Speak your task"}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z" />
                <path d="M19 11a7 7 0 0 1-14 0M12 18v3M8 21h8" />
              </svg>
              <span>{listening ? "Listening" : "Speak"}</span>
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={submit}
            disabled={!canSubmit}
          >
            {busy ? "Starting…" : "Start session"}
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {error && repos?.length === 0 && (
        <button className="btn btn-quiet" onClick={() => void loadRepos(true)} disabled={busy}>
          Retry loading repositories
        </button>
      )}
      <p className="hint">Enter to start · Shift+Enter for a new line.</p>
    </section>
  );
}
