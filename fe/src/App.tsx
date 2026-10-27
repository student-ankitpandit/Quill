import "./index.css";
import { useRoute, navigate, clearQueryParams } from "@/lib/router";
import {
  saveAuth,
  clearAuth,
  isLoggedIn,
  getInstallUrl,
  getLoginUrl,
  exchangeAuthCode,
  hasInstallation,
  resolveInstallation,
} from "@/lib/api";
import { LandingPage } from "./pages/LandingPage";
import { PolicyPage } from "./pages/PolicyPage";
import DashboardPage from "@/pages/DashboardPage";
import { RightSplitViewPage } from "@/pages/RightSplitView";
import { QuillMark } from "@/components/QuillMark";
import { Github, ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";

function AuthCallback({ code }: { code: string }) {
  useEffect(() => {
    if (!code) {
      navigate({ page: "auth-error", reason: "missing_code" });
      return;
    }

    exchangeAuthCode(code)
      .then(({ token, installationId }) => {
        clearQueryParams();
        saveAuth(token, installationId);
        navigate({ page: "dashboard" });
      })
      .catch((error: Error) => {
        navigate({ page: "auth-error", reason: error.message });
      });
  }, [code]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-muted-foreground text-sm animate-pulse">
        Authenticating...
      </div>
    </div>
  );
}

function AuthErrorPage({ reason }: { reason: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold">GitHub sign-in failed</h1>
      <p className="text-sm text-muted-foreground max-w-md">{reason}</p>
      <button
        className="text-sm text-brand hover:underline"
        onClick={() => navigate({ page: "landing" })}
      >
        Return to home
      </button>
    </div>
  );
}

function InstallationRequiredPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0d0e0f] px-6 text-[#eff0f1]">
      <section className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center shadow-2xl shadow-black/30">
        <div className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-xl border border-orange-400/25 bg-orange-400/10 text-orange-300">
          <QuillMark size={22} />
        </div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">One quick setup step</p>
        <h1 className="text-2xl font-semibold tracking-tight">Connect your GitHub repositories</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-neutral-400">
          Install the HelloQuill Integration GitHub App, then choose which repositories Quill can access. You’ll return here after installation.
        </p>
        <a
          href={getInstallUrl()}
          className="mx-auto mt-7 inline-flex items-center gap-2 rounded-lg bg-[#ff891f] px-5 py-3 text-sm font-semibold text-black transition hover:bg-[#ffa34d]"
        >
          <Github size={17} /> Install GitHub App <ArrowUpRight size={15} />
        </a>
        <p className="mt-4 text-xs text-neutral-500">Quill will only be able to access the repositories you select.</p>
      </section>
    </main>
  );
}

function GitHubReconnectPage({ expiredSession = false }: { expiredSession?: boolean }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0d0e0f] px-6 text-[#eff0f1]">
      <section className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center shadow-2xl shadow-black/30">
        <div className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-xl border border-orange-400/25 bg-orange-400/10 text-orange-300">
          <Github size={22} />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {expiredSession ? "Sign in to continue" : "Reconnect GitHub"}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-neutral-400">
          {expiredSession
            ? "Your Quill sign-in needs to be renewed. Continue with GitHub when you’re ready."
            : "Quill couldn’t refresh its GitHub connection automatically. Reconnect when you’re ready to continue using your repositories."}
        </p>
        <button
          type="button"
          className="mx-auto mt-7 inline-flex items-center gap-2 rounded-lg bg-[#ff891f] px-5 py-3 text-sm font-semibold text-black transition hover:bg-[#ffa34d]"
          onClick={() => { window.location.href = getLoginUrl(); }}
        >
          <Github size={17} /> {expiredSession ? "Sign in with GitHub" : "Reconnect GitHub"}
        </button>
        <button
          type="button"
          className="mx-auto mt-4 block text-sm text-neutral-400 hover:text-white"
          onClick={() => { clearAuth(); navigate({ page: "landing" }); }}
        >
          Sign out and go to Quill home
        </button>
      </section>
    </main>
  );
}

function DashboardGate({ initialView = "new" }: { initialView?: "new" | "settings" | "review" }) {
  const [status, setStatus] = useState<
    "checking" | "ready" | "install" | "login" | "reauthenticate"
  >(() => isLoggedIn() && hasInstallation() ? "ready" : "checking");

  useEffect(() => {
    // The signed Quill session already contains the installation id. Refreshing
    // GitHub OAuth on every dashboard entry needlessly rotates refresh tokens.
    if (isLoggedIn() && hasInstallation()) return;

    let cancelled = false;

    resolveInstallation()
      .then((result) => {
        if (cancelled) return;
        if (result.status === "ok") setStatus("ready");
        else if (result.status === "unauthenticated") setStatus("login");
        else if (result.status === "reauthenticate") setStatus("reauthenticate");
        else setStatus("install");
      })
      .catch(() => {
        // Keep the cached dashboard usable during a temporary backend or
        // GitHub outage. Authenticated API calls will surface actionable errors.
        if (!cancelled) setStatus(isLoggedIn() ? "ready" : "login");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground text-sm animate-pulse">
          Loading dashboard...
        </div>
      </div>
    );
  }

  if (status === "login") {
    return <GitHubReconnectPage expiredSession />;
  }

  if (status === "reauthenticate") {
    return <GitHubReconnectPage />;
  }

  if (status === "install") {
    return <InstallationRequiredPage />;
  }

  return <DashboardPage initialView={initialView} />;
}

function InstallationCallback({ installationId }: { installationId: string }) {
  useEffect(() => {
    clearQueryParams();
    // Re-authenticate after installation so the backend can verify this
    // installation against the user's own GitHub account.
    window.location.href = getLoginUrl(installationId);
  }, [installationId]);

  return null;
}

export function App() {
  const route = useRoute();

  switch (route.page) {
    case "landing":
      return <LandingPage />;
    case "policy":
      return <PolicyPage policy={route.policy} />;
    case "dashboard":
      if (!isLoggedIn()) {
        navigate({ page: "landing" });
        return null;
      }
      return <DashboardGate initialView="new" />;
    case "settings":
      if (!isLoggedIn()) {
        navigate({ page: "landing" });
        return null;
      }
      return <DashboardGate initialView="settings" />;
    case "review":
      if (!isLoggedIn()) {
        navigate({ page: "landing" });
        return null;
      }
      return <DashboardGate initialView="review" />;
    case "session":
      if (!isLoggedIn()) {
        navigate({ page: "landing" });
        return null;
      }
      return <RightSplitViewPage sessionId={route.sessionId} />;
    case "auth-callback":
      return <AuthCallback code={route.code} />;
    case "installation-callback":
      return <InstallationCallback installationId={route.installationId} />;
    case "auth-error":
      return <AuthErrorPage reason={route.reason} />;
    default:
      return <LandingPage />;
  }
}

export default App;
