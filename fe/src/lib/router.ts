import { useSyncExternalStore } from "react";

type Route =
  | { page: "landing" }
  | { page: "policy"; policy: "refund-policy" | "return-policy" | "privacy-policy" | "terms" }
  | { page: "dashboard" }
  | { page: "review" }
  | { page: "settings" }
  | { page: "session"; sessionId: string }
  | { page: "auth-callback"; code: string }
  | { page: "installation-callback"; installationId: string }
  | { page: "auth-error"; reason: string };

export function parseHash(): Route {
  const hash = window.location.hash.slice(1); // remove #
  const query = new URLSearchParams(window.location.search);
  const path = window.location.pathname.replace(/\/+$/, "");

  if (hash.startsWith("/auth/callback")) {
    const params = new URLSearchParams(hash.split("?")[1] || "");
    return { page: "auth-callback", code: params.get("code") || "" };
  }
  if (hash.startsWith("/auth/error")) {
    const params = new URLSearchParams(hash.split("?")[1] || "");
    return { page: "auth-error", reason: params.get("reason") || "unknown" };
  }
  if (hash.startsWith("/installation/callback")) {
    const params = new URLSearchParams(hash.split("?")[1] || "");
    return { page: "installation-callback", installationId: params.get("installation_id") || "" };
  }
  const policyHash = hash.match(/^\/(refund-policy|return-policy|privacy-policy|terms)$/);
  if (policyHash) {
    return { page: "policy", policy: policyHash[1] as Extract<Route, { page: "policy" }>["policy"] };
  }

  // GitHub's App Setup URL may point at the frontend root and append query
  // params instead of a hash (e.g. http://localhost:3000?installation_id=123).
  // Fall back to those so the install lands back on the dashboard.
  if (!hash) {
    const installationId = query.get("installation_id");
    if (installationId) return { page: "installation-callback", installationId };
    const code = query.get("code");
    if (code) return { page: "auth-callback", code };
    const reason = query.get("error") || query.get("error_description");
    if (reason) return { page: "auth-error", reason };
  }

  if (hash.startsWith("/session/")) {
    const sessionId = hash.replace("/session/", "");
    if (sessionId) return { page: "session", sessionId };
  }
  const policyPath = path.match(/^\/(refund-policy|return-policy|privacy-policy|terms)$/);
  if (policyPath) {
    return { page: "policy", policy: policyPath[1] as Extract<Route, { page: "policy" }>["policy"] };
  }
  const sessionPath = path.match(/^\/dashboard\/sessions\/([^/]+)$/);
  if (sessionPath) {
    try {
      return { page: "session", sessionId: decodeURIComponent(sessionPath[1]) };
    } catch {
      return { page: "landing" };
    }
  }
  if (path === "/dashboard/settings") return { page: "settings" };
  if (path === "/dashboard/review") return { page: "review" };
  if (hash === "/dashboard") return { page: "dashboard" };

  // GitHub's Setup URL is configured as the path "/dashboard", so support the
  // pathname form too (e.g. http://localhost:3000/dashboard).
  if (path === "/dashboard") return { page: "dashboard" };

  return { page: "landing" };
}

// Drop GitHub's OAuth/installation query params and normalize the path back
// to the SPA root so the hash router owns the URL. This prevents a refresh
// from re-triggering the callback flow.
export function clearQueryParams() {
  const { pathname, search, hash } = window.location;
  if (!search && pathname === "/") return;
  window.history.replaceState(null, "", `/${hash}`);
}

let currentRoute: Route = parseHash();
let lastNonSettingsRoute: Route | null = currentRoute.page === "settings" ? null : currentRoute;
const listeners = new Set<() => void>();

function syncRoute() {
  currentRoute = parseHash();
  if (currentRoute.page !== "settings") lastNonSettingsRoute = currentRoute;
  listeners.forEach((fn) => fn());
}

window.addEventListener("hashchange", () => {
  syncRoute();
});
window.addEventListener("popstate", () => {
  syncRoute();
});

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return currentRoute;
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, getSnapshot);
}

export function navigate(route: Route) {
  switch (route.page) {
    case "landing":
      window.history.pushState(null, "", "/");
      syncRoute();
      break;
    case "policy":
      window.location.hash = `/${route.policy}`;
      break;
    case "dashboard":
      window.history.pushState(null, "", "/dashboard");
      syncRoute();
      break;
    case "settings":
      if (currentRoute.page === "settings") {
        navigate(lastNonSettingsRoute ?? { page: "dashboard" });
        return;
      }
      lastNonSettingsRoute = currentRoute;
      window.history.pushState(null, "", "/dashboard/settings");
      syncRoute();
      break;
    case "review":
      window.history.pushState(null, "", "/dashboard/review");
      syncRoute();
      break;
    case "session":
      window.history.pushState(null, "", `/dashboard/sessions/${encodeURIComponent(route.sessionId)}`);
      syncRoute();
      break;
    case "auth-error":
      window.location.hash = `#/auth/error?reason=${encodeURIComponent(route.reason)}`;
      break;
  }
}
