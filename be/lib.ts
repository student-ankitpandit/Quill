import axios from "axios";
import jwt from "jsonwebtoken";
import { Octokit } from "octokit";
import type { Request, Response } from "express";
import { Sandbox } from "e2b";
import { getSession } from "./sessions";
import type { Session } from "./sessions";

type GithubTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  error?: string;
  error_description?: string;
};

type GithubTokens = {
  accessToken: string;
  refreshToken: string | null;
};

export type GithubUser = {
  id: number | string;
  login: string;
  name: string | null;
  email: string | null;
};

interface InstallationTokenResponse {
  token: string;
  expires_at: string;
  permissions: Record<string, string>;
  repositories: Array<{
    id: number;
    name: string;
    full_name: string;
  }>;
}

export const exchangeCodeForToken = async (
  code: string,
  clientId: string,
  clientSecret: string,
): Promise<GithubTokens> => {
  const response = await axios.post<GithubTokenResponse>(
    "https://github.com/login/oauth/access_token",
    {
      code,
      client_id: clientId,
      client_secret: clientSecret,
    },
    {
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    },
  );

  if (!response.data.access_token) {
    throw new Error(
      response.data.error_description ||
        response.data.error ||
        "GitHub did not return an access token. Reconnect your GitHub account.",
    );
  }

  return {
    accessToken: response.data.access_token,
    refreshToken: response.data.refresh_token ?? null,
  };
};

export async function refreshGithubAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<GithubTokens> {
  const response = await axios.post<GithubTokenResponse>(
    "https://github.com/login/oauth/access_token",
    {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    },
    {
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    },
  );

  if (!response.data.access_token) {
    throw new Error(
      response.data.error_description ||
        response.data.error ||
        "GitHub did not return an access token. Reconnect your GitHub account.",
    );
  }

  return {
    accessToken: response.data.access_token,
    refreshToken: response.data.refresh_token ?? refreshToken,
  };
}

export const getGithubUser = async (
  accessToken: string,
): Promise<GithubUser> => {
  const response = await axios.get<GithubUser>("https://api.github.com/user", {
    timeout: 15_000,
    headers: {
      Accept: "application/vnd.github+json", //github json representation
      Authorization: `Bearer ${accessToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  let email = response.data.email ?? null;
  try {
    const emails = await axios.get<
      Array<{ email: string; primary: boolean; verified: boolean }>
    >("https://api.github.com/user/emails", {
      timeout: 15_000,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    email =
      emails.data.find((item) => item.primary && item.verified)?.email ??
      emails.data.find((item) => item.verified)?.email ??
      email;
  } catch (error) {
    // Email lookup is optional (and requires the user:email OAuth scope). Avoid
    // logging the Axios error object because it includes request/config details.
    const status = axios.isAxiosError(error)
      ? error.response?.status
      : undefined;
    console.warn(
      status
        ? `Could not read the authenticated GitHub user's email (HTTP ${status}); using the public profile email when available.`
        : "Could not read the authenticated GitHub user's email; using the public profile email when available.",
    );
  }

  return {
    id: response.data.id,
    login: response.data.login,
    name: response.data.name ?? response.data.login ?? "",
    email,
  };
};

export async function getUserAppInstallation(
  accessToken: string,
  appId: string,
  preferredInstallationId?: string,
): Promise<string> {
  const response = await axios.get<{
    installations?: Array<{
      id: number;
      app_id?: number;
      app?: { id?: number };
    }>;
  }>("https://api.github.com/user/installations", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    params: { per_page: 100 },
  });

  const installations = response.data.installations ?? [];
  const expectedAppId = String(appId);
  const appInstallations = installations.filter((item) => {
    const itemAppId = String(item.app_id ?? item.app?.id ?? "");
    return itemAppId === expectedAppId;
  });

  const preferred = appInstallations.find(
    (item) => String(item.id) === preferredInstallationId,
  );
  const matched =
    preferred ??
    appInstallations.sort((a, b) => b.id - a.id)[0] ??
    (installations.length === 1 ? installations[0] : undefined);
  return matched ? String(matched.id) : "";
}

type AppInstallation = {
  id: number;
  account?: {
    id?: number;
    login?: string;
    type?: string;
  };
};

async function listAppInstallations(): Promise<AppInstallation[]> {
  const appJWT = getAppJWT();
  const results: AppInstallation[] = [];

  for (let page = 1; page <= 10; page++) {
    const response = await axios.get<
      AppInstallation[] | { installations?: AppInstallation[] }
    >("https://api.github.com/app/installations", {
      headers: {
        Authorization: `Bearer ${appJWT}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      params: { per_page: 100, page },
    });

    const batch = Array.isArray(response.data)
      ? response.data
      : (response.data.installations ?? []);
    results.push(...batch);
    if (batch.length < 100) break;
  }

  return results;
}

export async function findAppInstallationForGithubUser(opts: {
  githubUserId?: string | number;
  login?: string | null;
}): Promise<string> {
  const installations = await listAppInstallations();
  if (installations.length === 0) return "";
  const firstInstallation = installations[0];
  if (installations.length === 1 && firstInstallation) {
    return String(firstInstallation.id);
  }

  const userId = String(opts.githubUserId ?? "").replace(/^github/, "");
  const login = opts.login?.trim().toLowerCase() ?? "";

  const matched = installations.find((item) => {
    const accountId = String(item.account?.id ?? "");
    const accountLogin = item.account?.login?.toLowerCase() ?? "";
    if (userId && accountId === userId) return true;
    if (login && accountLogin === login) return true;
    return false;
  });

  return matched ? String(matched.id) : "";
}

export function getAppJWT(): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: process.env.GITHUB_APP_ID!,
    iat: now - 60,
    exp: now + 60 * 9,
  };

  return jwt.sign(payload, process.env.GITHUB_PRIVATE_KEY!, {
    algorithm: "RS256",
  });
}

export async function getInstallationToken(
  installationId: string,
): Promise<string> {
  const appJWT = getAppJWT();

  const response = await axios.post(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    undefined,
    {
      headers: {
        Authorization: `Bearer ${appJWT}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      timeout: 15_000,
    },
  );

  if (!response.data) {
    const error = await response.data;
    throw new Error(`Failed to get installation token: ${error}`);
  }

  const data = (await response.data) as InstallationTokenResponse;
  return data.token;
}

export async function getInstallationOctokit(
  installationId: string,
): Promise<Octokit> {
  const token = await getInstallationToken(installationId);
  return new Octokit({ auth: token, request: { timeout: 15_000 } });
}

export async function loadOwned(
  req: Request,
  res: Response,
): Promise<Session | null> {
  const sessionId = (req.params.id ?? req.params.sessionId) as
    | string
    | undefined;
  const session = sessionId ? await getSession(sessionId) : null;
  if (!session || session.installationId !== req.installationId) {
    res.sendStatus(404);
    return null;
  }
  return session;
}

export async function waitForPort(
  sandbox: Sandbox,
  port: number,
  timeoutMs = 60_000,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      // curl exits non-zero (and run() throws) while nothing is listening yet
      await sandbox.commands.run(
        `curl -s -o /dev/null http://localhost:${port}`,
        { timeoutMs: 5_000 },
      );
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 1_000));
    }
  }
  return false;
}

export function isSandboxNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: string; message?: string };
  return (
    candidate.name === "SandboxNotFoundError" ||
    /(?:paused )?sandbox .* not found/i.test(candidate.message ?? "")
  );
}

export async function connectSessionSandbox(
  sandboxId: string,
): Promise<Sandbox> {
  const sandbox = await Sandbox.connect(sandboxId);
  // Reset the idle timer on activity. New sandboxes are configured to pause,
  // rather than be destroyed, when this timeout elapses.
  await sandbox.setTimeout(30 * 60 * 1000);
  return sandbox;
}
