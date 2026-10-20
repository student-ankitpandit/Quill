import "./index.css";
import { useRoute, navigate, clearQueryParams } from "@/lib/router";
import {
  saveAuth,
  saveInstallation,
  isLoggedIn,
  getInstallUrl,
  getLoginUrl,
  exchangeAuthCode,
  resolveInstallation,
} from "@/lib/api";
import { LandingPage } from "./pages/LandingPage";
import { PolicyPage } from "./pages/PolicyPage";
import DashboardPage from "@/pages/DashboardPage";
import { RightSplitViewPage } from "@/pages/RightSplitView";
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

function DashboardGate() {
  const [status, setStatus] = useState<
    "checking" | "ready" | "install" | "login"
  >("checking");

  useEffect(() => {
    let cancelled = false;

    resolveInstallation()
      .then((result) => {
        if (cancelled) return;
        if (result.status === "ok") setStatus("ready");
        else if (
          result.status === "unauthenticated" ||
          result.status === "reauthenticate"
        )
          setStatus("login");
        else setStatus("install");
      })
      .catch(() => {
        if (!cancelled) setStatus("login");
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
    window.location.href = getLoginUrl();
    return null;
  }

  if (status === "install") {
    window.location.replace(getInstallUrl());
    return null;
  }

  return <DashboardPage />;
}

function InstallationCallback({ installationId }: { installationId: string }) {
  useEffect(() => {
    clearQueryParams();
    if (installationId) saveInstallation(installationId);
    if (isLoggedIn()) {
      navigate({ page: "dashboard" });
      return;
    }
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
      return <DashboardGate />;
    case "settings":
      if (!isLoggedIn()) {
        navigate({ page: "landing" });
        return null;
      }
      return <DashboardPage initialView="settings" />;
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
