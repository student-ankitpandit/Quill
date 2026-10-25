import express from "express";
import jwt from "jsonwebtoken";
import {
  exchangeCodeForToken,
  getGithubUser,
  getUserAppInstallation,
  refreshGithubAccessToken,
  getInstallationOctokit,
  getInstallationToken,
} from "./lib";
import {
  getSession,
  listSessions,
  saveSession,
  setStatus,
  log,
} from "./sessions";
import type { Session } from "./sessions";
import { storage, type InstallationData } from "./storage";
import { getRepoConfig, saveRepoConfig } from "./repo-config";
import axios from "axios";
import Sandbox from "@e2b/code-interpreter";
import { randomUUID } from "node:crypto";

import {
  answerSideChat,
  isInformationalQuestion,
  publishChanges,
  queueAgentMessage,
  runAgent,
  stopAgent,
  stopRequests,
} from "./agent";
import { publish, subscribe } from "./events";
import { connectUpStream, ensureRelay, RELAY_PORT } from "./browser-stream";
import { Readable } from "node:stream";
import sessionRoutes, { prepareWorkspace } from "./routes/session";
import { authMiddleware } from "./middlewares/authMiddleware";
import {
  connectSessionSandbox,
  isSandboxNotFoundError,
  loadOwned,
} from "./lib";
import { saveInstallation } from "./installations";
import { appendSideChat, getSideChat } from "./side-chat";
import { getTerminalPid, setTerminalPid } from "./terminal-sessions";
import { migrateLegacyJsonData } from "./legacy-data-migration";
import { prisma } from "./db";
import { quoteShell, workspacePath, assertWorkspacePathInside, signUserToken, resolveInstallationId } from "./lib"

const REPO_NAME = /^[\w.-]+\/[\w.-]+$/;
const REPO_DIR = "/home/user/repo";
const SAFE = /^[\w-]+$/;
const publishing = new Set<string>();

const app = express();
app.use(express.json({ limit: "2mb" }));

// CORS for the deployed frontend and local frontend development server.
const configuredFrontendOrigin = (process.env.FRONTEND_URL || "http://localhost:3000")
  .trim()
  .replace(/\/+$/, "");
const allowedFrontendOrigins = new Set([
  configuredFrontendOrigin,
]);
app.use((req, res, next) => {
  const requestOrigin = req.header("Origin");
  const isLocalDevelopmentOrigin = (() => {
    if (!requestOrigin) return false;
    try {
      const url = new URL(requestOrigin);
      return url.protocol === "http:" && (
        url.hostname === "localhost" ||
        url.hostname.endsWith(".localhost") ||
        url.hostname === "127.0.0.1" ||
        url.hostname === "[::1]"
      );
    } catch {
      return false;
    }
  })();
  if (
    requestOrigin &&
    (allowedFrontendOrigins.has(requestOrigin) || isLocalDevelopmentOrigin)
  ) {
    res.header("Access-Control-Allow-Origin", requestOrigin);
    res.header("Vary", "Origin");
  }
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// app.use('/internal/sandbox', internalRoutes); //didn't going to until the agent loop in a seprated worker

app.get("/health", (req, res) => {
  res.send({ message: "healthy" });
});

// GitHub OAuth: redirect user to GitHub's authorize page
app.get("/api/auth/github", (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return res.status(503).send("GitHub OAuth is not configured on the backend.");
  }
  const installationId =
    typeof req.query.installation_id === "string"
      ? req.query.installation_id
      : "";
  const backendUrl = (process.env.BACKEND_URL || "http://localhost:3001")
    .trim()
    .replace(/\/+$/, "");
  const redirectUri = `${backendUrl}/api/auth/github/callback`;
  const scope = "user:email,read:user,read:org,offline_access";
  const state = installationId
    ? `&state=${encodeURIComponent(installationId)}`
    : "";
  const url = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}${state}`;
  res.redirect(url);
});

app.get("/api/auth/github/callback", async (req, res) => {
  const { code, installation_id, setup_action, state } = req.query;
  const feOrigin = process.env.FRONTEND_URL || "http://localhost:3000";

  // GitHub sends the post-installation redirect here with `installation_id`
  // and `setup_action` but WITHOUT an OAuth `code`. Handle that first so we
  // don't bounce the user to an auth error after installing the App.
  const returnedInstallationId =
    typeof installation_id === "string" ? installation_id : "";
  if (returnedInstallationId && !code) {
    await saveInstallation(
      returnedInstallationId,
      typeof setup_action === "string" ? setup_action : undefined,
    );
    return res.redirect(
      `${feOrigin}/#/installation/callback?installation_id=${encodeURIComponent(returnedInstallationId)}`,
    );
  }

  if (!code) {
    return res.redirect(`${feOrigin}/#/auth/error?reason=no_code`);
  }

  try {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.redirect(`${feOrigin}/#/auth/error?reason=not_configured`);
    }

    const tokenResponse = await exchangeCodeForToken(
      code as string,
      clientId,
      clientSecret,
    );

    const githubUser = await getGithubUser(tokenResponse.accessToken);

    const userId = `github${githubUser.id}`;
    const callbackInstallationId =
      typeof installation_id === "string" ? installation_id : "";
    const instId = await resolveInstallationId({
      preferredInstallationId:
        callbackInstallationId || (typeof state === "string" ? state : undefined),
      accessToken: tokenResponse.accessToken,
    });
    if (instId) {
      await storage.setInstallationForUser(userId, instId, {
        githubUserId: String(githubUser.id),
        refreshToken: tokenResponse.refreshToken,
        email: githubUser.email,
        emailLookupAt: undefined,
        name: githubUser.name ?? undefined,
        login: githubUser.login,
      });
    }

    // Sign a short-lived exchange code so the callback survives backend restarts.
    const exchangeCode = jwt.sign(
      {
        purpose: "auth-exchange",
        installationId: instId,
        userId,
        login: githubUser.login,
        name: githubUser.name,
        email: githubUser.email,
      },
      process.env.GITHUB_PRIVATE_KEY!,
      { algorithm: "RS256", expiresIn: "60s" },
    );

    return res.redirect(
      `${feOrigin}/#/auth/callback?code=${encodeURIComponent(exchangeCode)}`,
    );
  } catch (e) {
    console.error("GitHub OAuth error:", e);
    return res.redirect(`${feOrigin}/#/auth/error?reason=failed`);
  }
});

app.post("/api/auth/exchange", (req, res) => {
  const exchangeCode = typeof req.body?.code === "string" ? req.body.code : "";
  try {
    const exchange = jwt.verify(exchangeCode, process.env.GITHUB_PRIVATE_KEY!, {
      algorithms: ["RS256"],
    }) as jwt.JwtPayload & {
      purpose?: string;
      installationId?: string;
      userId?: string;
      login?: string;
      name?: string;
      email?: string | null;
    };

    if (exchange.purpose !== "auth-exchange" || !exchange.userId) {
      return res.status(401).json({ error: "Invalid authentication callback" });
    }

    const token = signUserToken({
      installationId: exchange.installationId,
      userId: exchange.userId,
      login: exchange.login,
      name: exchange.name,
      email: exchange.email,
    });

    return res.json({
      token,
      installationId: exchange.installationId,
    });
  } catch {
    return res.status(401).json({ error: "Authentication callback expired" });
  }
});

app.get("/api/app/github/install", (req, res) => {
  const installationId =
    (typeof req.query.installation_id === "string" &&
      req.query.installation_id) ||
    "";
  const url = installationId
    ? `https://github.com/settings/installations/${encodeURIComponent(installationId)}`
    : "https://github.com/apps/helloquill-ai-integration/installations/new";
  return res.redirect(url);
});

// Apply auth middleware to all routes below
app.use(authMiddleware);
app.use("/api/app/sessions", sessionRoutes);

app.get("/api/auth/profile", async (req, res) => {
  if (!req.userId)
    return res.status(401).json({ error: "Missing user account" });
  try {
    const publicUserId = await storage.getOrCreatePublicUserId(req.userId);
    let email = req.email ?? "";
    let name = req.name ?? "";
    let login = req.login ?? "";
    const stored = await storage.findByUserId(req.userId);
    email ||= stored?.email ?? "";
    name ||= stored?.name ?? "";
    login ||= stored?.login ?? "";
    const emailLookupIsCoolingDown =
      stored?.emailLookupAt &&
      Date.now() - stored.emailLookupAt < 15 * 60 * 1000;
    if (!email && !emailLookupIsCoolingDown) {
      try {
        const clientId = process.env.GITHUB_CLIENT_ID;
        const clientSecret = process.env.GITHUB_CLIENT_SECRET;
        if (stored?.refreshToken && clientId && clientSecret) {
          const refreshed = await refreshGithubAccessToken(
            stored.refreshToken,
            clientId,
            clientSecret,
          );
          // GitHub rotates OAuth refresh tokens. Persist the replacement before
          // making another API request so a failed profile lookup cannot leave
          // the old, now-invalid refresh token in storage.
          await storage.setInstallationForUser(
            req.userId,
            stored.installation_id,
            {
              githubUserId: stored.githubUserId,
              refreshToken: refreshed.refreshToken,
              emailLookupAt: Date.now(),
            },
          );
          const githubUser = await getGithubUser(refreshed.accessToken);
          email = githubUser.email ?? "";
          name = githubUser.name ?? name;
          login = githubUser.login ?? login;
          if (email || name || login) {
            await storage.setInstallationForUser(
              req.userId,
              stored.installation_id,
              {
                githubUserId: stored.githubUserId,
                refreshToken: refreshed.refreshToken,
                email: githubUser.email,
                emailLookupAt: Date.now(),
                name: githubUser.name ?? undefined,
                login: githubUser.login,
              },
            );
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn("Could not refresh GitHub profile email:", message);
        if (stored?.refreshToken) {
          await storage
            .setInstallationForUser(req.userId, stored.installation_id, {
              githubUserId: stored.githubUserId,
              refreshToken: stored.refreshToken,
              emailLookupAt: Date.now(),
            })
            .catch(() => undefined);
        }
      }
    }
    await storage.updateProfile(req.userId, {
      ...(login ? { login } : {}),
      ...(name ? { name } : {}),
      ...(email ? { email } : {}),
    });
    return res.json({
      userId: publicUserId,
      name,
      login,
      email,
    });
  } catch (error) {
    console.error("Could not load user profile", error);
    return res.status(500).json({ error: "Could not load user profile" });
  }
});

app.get("/api/auth/installation", async (req, res) => {
  let instId = "";
  let refreshToken: string | null = null;
  let storedInstallation: InstallationData | null = null;

  if (!req.userId) return res.status(401).json({ error: "Missing user account" });
  try {
    storedInstallation = await storage.findByUserId(req.userId);
    if (!storedInstallation) {
      return res.json({ installationId: null, token: null });
    }
    if (!storedInstallation.refreshToken) {
      return res.json({ reauthenticate: true });
    }

    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.status(503).json({ error: "GitHub OAuth is not configured" });
    }

    const refreshed = await refreshGithubAccessToken(
      storedInstallation.refreshToken,
      clientId,
      clientSecret,
    );
    refreshToken = refreshed.refreshToken;
    instId = await getUserAppInstallation(
      refreshed.accessToken,
      process.env.GITHUB_APP_ID || "",
      storedInstallation.installation_id,
    );
  } catch (error) {
    console.warn("Could not refresh this user's GitHub installation access", error);
    return res.json({ reauthenticate: true });
  }

  if (!instId) {
    return res.json({ installationId: null, token: null });
  }

  if (req.userId) {
    await storage.setInstallationForUser(req.userId, instId, {
      githubUserId: String(req.userId).replace(/^github/, ""),
      ...(refreshToken ? { refreshToken } : {}),
    });
  }

  return res.json({
    installationId: instId,
    token: signUserToken({
      installationId: instId,
      userId: req.userId,
      login: req.login,
      name: req.name,
    }),
  });
});

app.get("/api/github/repos", async (req, res) => {
  const installation_id = req.installationId;

  if (!installation_id) {
    return res.status(400).json({ error: "Missing installation_id" });
  }

  try {
    const authToken = await getInstallationToken(installation_id);
    const repositories: Array<Record<string, unknown>> = [];
    let page = 1;
    let totalCount = Number.POSITIVE_INFINITY;

    while (repositories.length < totalCount) {
      const response = await axios.get<{
        total_count: number;
        repositories: Array<Record<string, unknown>>;
      }>("https://api.github.com/installation/repositories", {
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        params: { per_page: 100, page },
        timeout: 15_000,
      });

      repositories.push(...response.data.repositories);
      totalCount = response.data.total_count;
      if (response.data.repositories.length === 0) break;
      page += 1;
    }

    return res.json(repositories);
  } catch (error) {
    const githubStatus = axios.isAxiosError(error)
      ? error.response?.status
      : undefined;
    console.error(
      "Failed to list repositories for the GitHub App installation:",
      githubStatus ? `GitHub returned HTTP ${githubStatus}` : error,
    );
    return res.status(502).json({
      error: githubStatus
        ? `GitHub could not list this app installation's repositories (HTTP ${githubStatus}). Reconnect the GitHub App and try again.`
        : "Could not load repositories from this GitHub App installation.",
    });
  }
});

app.post("/api/github/repo/config", async (req, res) => {
  const {
    repoFullName,
    buildCommand,
    runCommand,
    installCommand,
    testCommand,
    port,
    hasUI,
    repoOwnerName,
  } = req.body;
  const installationId = req.installationId;

  try {
    const repoConfigs = await saveRepoConfig(installationId, repoFullName, {
      buildCommand,
      testCommand,
      runCommand,
      installCommand,
      port,
      hasUI,
    });

    return res.json(repoConfigs);
  } catch (e) {
    console.log(e);
    return res.status(500).json({
      error: "Failed to save repo configs",
    });
  }
});

app.post("/api/app/sessions", async (req, res) => {
  const installationId = req.installationId;
  if (!installationId)
    return res.status(401).json({ error: "Not authenticated" });

  const { repoFullName } = req.body ?? {};
  const rawTask =
    typeof req.body?.task === "string" ? req.body.task.trim() : "";
  const hasIssue = req.body?.issueNumber != null && req.body.issueNumber !== "";
  const issueNumber = hasIssue ? Number(req.body.issueNumber) : undefined;

  if (typeof repoFullName !== "string" || !REPO_NAME.test(repoFullName)) {
    return res.status(400).json({ error: "Invalid repo name" });
  }
  if (!rawTask && issueNumber === undefined) {
    return res
      .status(400)
      .json({ error: "Provide a task, an issueNumber, or both" });
  }
  if (
    issueNumber !== undefined &&
    (!Number.isInteger(issueNumber) || issueNumber < 1)
  ) {
    return res
      .status(400)
      .json({ error: "issueNumber must be a positive integer" });
  }
  if (rawTask.length > 10_000) {
    return res.status(400).json({ error: "task is too long" });
  }

  try {
    let title = rawTask.split("\n")[0].slice(0, 80);
    let task = rawTask;

    if (issueNumber !== undefined) {
      const octokit = await getInstallationOctokit(installationId);
      const [owner, repo] = repoFullName.split("/");

      if (!owner || !repo) {
        return res.status(400).json({ error: "Repo name is required" });
      }

      const issue = await octokit.rest.issues
        .get({ owner, repo, issue_number: issueNumber })
        .then((r) => r.data)
        .catch((err) => {
          if (err.status === 404) return null;
          throw err;
        });

      if (!issue)
        return res
          .status(404)
          .json({ error: `Issue #${issueNumber} not found` });
      if (issue.pull_request) {
        return res
          .status(400)
          .json({ error: `#${issueNumber} is a pull request, not an issue` });
      }

      title = issue.title;
      task =
        `GitHub issue #${issueNumber}: ${issue.title}\n\n${(issue.body ?? "").slice(0, 20_000)}` +
        (rawTask
          ? `\n\nAdditional instructions from the user:\n${rawTask}`
          : "");
    }

    const token = await getInstallationToken(installationId);

    const sandboxTemplate = process.env.E2B_TEMPLATE?.trim();
    const sandboxOptions = {
      timeoutMs: 30 * 60 * 1000,
      lifecycle: { onTimeout: "pause" as const, autoResume: true },
    };
    const sandbox = sandboxTemplate
      ? await Sandbox.create(sandboxTemplate, sandboxOptions)
      : await Sandbox.create(sandboxOptions);
    try {
      await sandbox.commands.run(
        `git clone https://x-access-token:${token}@github.com/${repoFullName}.git repo`,
        { timeoutMs: 120_000 },
      );
      // The sandbox is user-visible through its terminal. Never leave the
      // installation credential in the cloned repository's .git/config.
      await sandbox.commands.run(
        `git -C repo remote set-url origin ${quoteShell(`https://github.com/${repoFullName}.git`)}`,
        { timeoutMs: 10_000 },
      );
    } catch (err: any) {
      await sandbox.kill().catch(() => {});
      throw new Error(
        `git clone failed: ${String(err.stderr ?? err.message)
          .split(token)
          .join("***")}`,
      );
    }

    const session: Session = {
      id: randomUUID(),
      installationId,
      repoFullName,
      sandboxId: sandbox.sandboxId,
      task,
      title,
      issueNumber, // undefined for free-text tasks (dropped when saved as JSON)
      status: "ready",
      createdAt: new Date().toISOString(),
      messages: [{ role: "user", content: task }],
      logs: [],
      repoPath: "/home/user/repo",
      previewStarted: false,
    };
    setStatus(session, "running");
    await saveSession(session);

    res.status(201).json(session);
    void prepareWorkspace(session)
      .catch(async (error: any) => {
        console.error("Sandbox setup failed", error);
        log(
          session,
          "error",
          `Sandbox setup failed: ${error.message}. Handing the cloned repository to the agent.`,
        );
        await saveSession(session);
      })
      .finally(() => {
        if (session.status === "running") void runAgent(session);
      });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create session" });
  }
});

app.get("/api/sessions", async (req, res) => {
  const installationId = req.installationId;

  return res.json(await listSessions(installationId));
});

app.post("/api/sessions/:sessionId/run", async (req, res) => {
  const session = await getSession(req.params.sessionId);
  if (
    !req.installationId ||
    !session ||
    session.installationId !== req.installationId
  ) {
    return res.status(404).json({ error: "Session not found" });
  }
  if (session.status === "running") {
    return res.status(409).json({ error: "Session is already running" });
  }

  setStatus(session, "running");
  await saveSession(session);
  void runAgent(session);
  return res.status(202).json({ status: session.status });
});

app.get("/api/sessions/:sessionId", async (req, res) => {
  const sessionId = req.params.sessionId;
  const installationId = req.installationId;

  try {
    const session = await getSession(sessionId);

    if (
      !installationId ||
      !session ||
      session.installationId !== installationId
    ) {
      return res.status(404).json({ error: "Session not found" });
    }

    let gitDiff = "";

    if (!isInformationalQuestion(session.task)) {
      try {
        const sandbox = await connectSessionSandbox(session.sandboxId);
        const diffResult = await sandbox.commands.run(
          "git -C repo add -N . && git -C repo diff HEAD",
          {
            timeoutMs: 30000,
          },
        );

        gitDiff = diffResult.stdout.slice(0, 200_000);
      } catch (error) {
        if (isSandboxNotFoundError(error)) {
          return res.json({
            ...session,
            messages: session.messages,
            logs: session.logs,
            gitDiff,
            workspaceUnavailable: true,
          });
        }
        console.warn(
          "Could not load session changes:",
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    return res.json({
      ...session,
      messages: session.messages,
      logs: session.logs,
      gitDiff,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: "Failed to fetch session" });
  }
});

app.get("/api/app/sessions/:sessionId/workspace/files", async (req, res) => {
  const session = await loadOwned(req, res);
  if (!session) return;
  try {
    const { relative, absolute } = workspacePath(req.query.path);
    const sandbox = await connectSessionSandbox(session.sandboxId);
    const realPath = await assertWorkspacePathInside(sandbox, absolute);
    const result = await sandbox.commands.run(
      `find ${quoteShell(realPath)} -mindepth 1 -maxdepth 1 -printf '%f\\t%y\\t%s\\n'`,
      { cwd: REPO_DIR, timeoutMs: 15_000 },
    );
    const entries = result.stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [name = "", kind = "f", size = "0"] = line.split("\t");
        return {
          name,
          type: kind === "d" ? "directory" : kind === "l" ? "symlink" : "file",
          size: Number(size) || 0,
        };
      })
      .sort(
        (a, b) =>
          Number(b.type === "directory") - Number(a.type === "directory") ||
          a.name.localeCompare(b.name),
      );
    return res.json({ path: relative, entries });
  } catch (error) {
    if (isSandboxNotFoundError(error))
      return res
        .status(410)
        .json({ error: "This session workspace has expired." });
    return res
      .status(400)
      .json({
        error:
          error instanceof Error
            ? error.message
            : "Could not list workspace files.",
      });
  }
});

app.get("/api/app/sessions/:sessionId/workspace/file", async (req, res) => {
  const session = await loadOwned(req, res);
  if (!session) return;
  try {
    const { relative, absolute } = workspacePath(req.query.path);
    if (!relative)
      return res.status(400).json({ error: "Choose a file to open." });
    const sandbox = await connectSessionSandbox(session.sandboxId);
    const realPath = await assertWorkspacePathInside(sandbox, absolute);
    const size = await sandbox.commands.run(`wc -c < ${quoteShell(realPath)}`, {
      cwd: REPO_DIR,
      timeoutMs: 10_000,
    });
    const byteLength = Number(size.stdout.trim());
    if (!Number.isFinite(byteLength))
      return res.status(400).json({ error: "Could not read file metadata." });
    if (byteLength > 1_000_000)
      return res
        .status(413)
        .json({
          error: "Files larger than 1 MB cannot be opened in the editor.",
        });
    const encoded = await sandbox.commands.run(
      `base64 -w 0 -- ${quoteShell(realPath)}`,
      { cwd: REPO_DIR, timeoutMs: 10_000 },
    );
    const content = Buffer.from(encoded.stdout.trim(), "base64").toString(
      "utf8",
    );
    if (content.includes("\u0000"))
      return res
        .status(415)
        .json({
          error: "This looks like a binary file and cannot be edited here.",
        });
    return res.json({ path: relative, content, byteLength });
  } catch (error) {
    if (isSandboxNotFoundError(error))
      return res
        .status(410)
        .json({ error: "This session workspace has expired." });
    return res
      .status(400)
      .json({
        error:
          error instanceof Error ? error.message : "Could not open this file.",
      });
  }
});

app.put("/api/app/sessions/:sessionId/workspace/file", async (req, res) => {
  const session = await loadOwned(req, res);
  if (!session) return;
  if (
    typeof req.body?.content !== "string" ||
    Buffer.byteLength(req.body.content, "utf8") > 1_000_000
  ) {
    return res
      .status(400)
      .json({ error: "File content must be text smaller than 1 MB." });
  }
  try {
    const { relative, absolute } = workspacePath(req.body.path);
    if (!relative)
      return res.status(400).json({ error: "Choose a file to save." });
    const sandbox = await connectSessionSandbox(session.sandboxId);
    const realPath = await assertWorkspacePathInside(sandbox, absolute);
    const base64 = Buffer.from(req.body.content, "utf8").toString("base64");
    await sandbox.commands.run(
      `printf '%s' '${base64}' | base64 -d > ${quoteShell(realPath)}`,
      { cwd: REPO_DIR, timeoutMs: 15_000 },
    );
    return res.json({ path: relative, saved: true });
  } catch (error) {
    if (isSandboxNotFoundError(error))
      return res
        .status(410)
        .json({ error: "This session workspace has expired." });
    return res
      .status(400)
      .json({
        error:
          error instanceof Error ? error.message : "Could not save this file.",
      });
  }
});

app.get("/api/app/sessions/:sessionId/changes", async (req, res) => {
  const session = await loadOwned(req, res);
  if (!session) return;
  try {
    const sandbox = await connectSessionSandbox(session.sandboxId);
    const result = await sandbox.commands.run(
      "git add -N . >/dev/null 2>&1; git diff HEAD --",
      { cwd: REPO_DIR, timeoutMs: 30_000 },
    );
    return res.json({ diff: result.stdout.slice(0, 500_000) });
  } catch (error) {
    if (isSandboxNotFoundError(error))
      return res
        .status(410)
        .json({ error: "This session workspace has expired." });
    return res
      .status(502)
      .json({
        error:
          error instanceof Error ? error.message : "Could not load changes.",
      });
  }
});

app.post("/api/app/sessions/:sessionId/terminal/start", async (req, res) => {
  const session = await loadOwned(req, res);
  if (!session) return;
  try {
    const sandbox = await connectSessionSandbox(session.sandboxId);
    const existingPid = await getTerminalPid(session.id);
    const processes = await sandbox.commands.list();
    if (
      existingPid &&
      processes.some((process) => process.pid === existingPid)
    ) {
      return res.json({ pid: existingPid, cwd: REPO_DIR });
    }
    const handle = await sandbox.pty.create({
      cols: Math.min(240, Math.max(40, Number(req.body?.cols) || 100)),
      rows: Math.min(100, Math.max(10, Number(req.body?.rows) || 30)),
      cwd: REPO_DIR,
      timeoutMs: 30 * 60 * 1000,
      envs: { TERM: "xterm-256color", PS1: "quill@e2b:\\w$ " },
      onData: () => undefined,
    });
    await handle.disconnect();
    await setTerminalPid(session.id, handle.pid);
    await sandbox.pty.sendInput(
      handle.pid,
      new TextEncoder().encode("export PS1='quill@e2b:\\w$ '\n"),
    );
    return res.json({ pid: handle.pid, cwd: REPO_DIR });
  } catch (error) {
    if (isSandboxNotFoundError(error))
      return res
        .status(410)
        .json({ error: "This session workspace has expired." });
    return res
      .status(502)
      .json({
        error:
          error instanceof Error
            ? error.message
            : "Could not start the sandbox terminal.",
      });
  }
});

app.get("/api/app/sessions/:sessionId/terminal/stream", async (req, res) => {
  const session = await loadOwned(req, res);
  if (!session) return;
  const pid = await getTerminalPid(session.id);
  if (!pid) return res.status(404).json({ error: "Start the terminal first." });
  try {
    const sandbox = await connectSessionSandbox(session.sandboxId);
    const processes = await sandbox.commands.list();
    if (!processes.some((process) => process.pid === pid)) {
      await setTerminalPid(session.id, undefined);
      return res
        .status(410)
        .json({
          error: "The terminal process has ended. Start a new terminal.",
        });
    }
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    const handle = await sandbox.pty.connect(pid, {
      timeoutMs: 30 * 60 * 1000,
      onData: (data) => {
        if (!res.destroyed)
          res.write(
            `event: output\ndata: ${Buffer.from(data).toString("base64")}\n\n`,
          );
      },
    });
    const heartbeat = setInterval(() => res.write(": ping\n\n"), 25_000);
    res.on("close", () => {
      clearInterval(heartbeat);
      void handle.disconnect();
    });
    void handle
      .wait()
      .then(() => {
        if (!res.destroyed) res.write("event: exit\ndata: {}\n\n");
        res.end();
        void setTerminalPid(session.id, undefined);
      })
      .catch((error) => {
        if (!res.destroyed) {
          res.write(
            `event: terminal-error\ndata: ${JSON.stringify({ error: error instanceof Error ? error.message : "Terminal disconnected." })}\n\n`,
          );
          res.end();
        }
      });
  } catch (error) {
    if (isSandboxNotFoundError(error))
      return res
        .status(410)
        .json({ error: "This session workspace has expired." });
    if (!res.headersSent)
      return res
        .status(502)
        .json({
          error:
            error instanceof Error
              ? error.message
              : "Could not connect to the terminal.",
        });
    return res.end();
  }
});

app.post("/api/app/sessions/:sessionId/terminal/input", async (req, res) => {
  const session = await loadOwned(req, res);
  if (!session) return;
  const data = typeof req.body?.data === "string" ? req.body.data : "";
  if (!data || Buffer.byteLength(data, "utf8") > 8192)
    return res
      .status(400)
      .json({ error: "Terminal input is empty or too long." });
  try {
    const pid = await getTerminalPid(session.id);
    if (!pid)
      return res.status(409).json({ error: "Start the terminal first." });
    const sandbox = await connectSessionSandbox(session.sandboxId);
    await sandbox.pty.sendInput(pid, new TextEncoder().encode(data));
    return res.json({ sent: true });
  } catch (error) {
    if (isSandboxNotFoundError(error))
      return res
        .status(410)
        .json({ error: "This session workspace has expired." });
    return res
      .status(502)
      .json({
        error:
          error instanceof Error
            ? error.message
            : "Could not send terminal input.",
      });
  }
});

app.post("/api/app/sessions/:sessionId/terminal/resize", async (req, res) => {
  const session = await loadOwned(req, res);
  if (!session) return;
  try {
    const pid = await getTerminalPid(session.id);
    if (!pid)
      return res.status(409).json({ error: "Start the terminal first." });
    const sandbox = await connectSessionSandbox(session.sandboxId);
    await sandbox.pty.resize(pid, {
      cols: Math.min(240, Math.max(40, Number(req.body?.cols) || 100)),
      rows: Math.min(100, Math.max(10, Number(req.body?.rows) || 30)),
    });
    return res.json({ resized: true });
  } catch (error) {
    if (isSandboxNotFoundError(error))
      return res
        .status(410)
        .json({ error: "This session workspace has expired." });
    return res
      .status(502)
      .json({
        error:
          error instanceof Error
            ? error.message
            : "Could not resize the terminal.",
      });
  }
});

app.get("/api/app/sessions/:sessionId/side-chat", async (req, res) => {
  const session = await loadOwned(req, res);
  if (!session) return;
  return res.json({ messages: await getSideChat(session.id) });
});

app.post("/api/app/sessions/:sessionId/side-chat", async (req, res) => {
  const session = await loadOwned(req, res);
  if (!session) return;
  const question =
    typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!question)
    return res.status(400).json({ error: "Enter a question first." });
  if (question.length > 10_000)
    return res.status(400).json({ error: "Message is too long." });
  try {
    const now = new Date().toISOString();
    await appendSideChat(session.id, [
      { role: "user", content: question, time: now },
    ]);
    const answer = await answerSideChat(session, question);
    const messages = await appendSideChat(session.id, [
      { role: "assistant", content: answer, time: new Date().toISOString() },
    ]);
    return res.json({ messages });
  } catch (error) {
    console.error(
      "Side chat failed:",
      error instanceof Error ? error.message : String(error),
    );
    return res
      .status(502)
      .json({
        error: "Side chat could not generate a reply. Please try again.",
      });
  }
});

app.post("/api/sessions/:sessionId/messages", async (req, res) => {
  const installationId = req.installationId;
  const sessionId = req.params.sessionId;
  const message =
    typeof req.body?.message === "string"
      ? req.body.message.trim()
      : typeof req.body?.content === "string"
        ? req.body.content.trim()
        : "";

  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  if (message.length > 20_000) {
    return res.status(400).json({ error: "Message is too long" });
  }

  try {
    const session = await getSession(sessionId);

    if (
      !installationId ||
      !session ||
      session.installationId !== installationId
    ) {
      return res.status(404).json({ error: "Session not found" });
    }

    if (session.status === "running") {
      await queueAgentMessage(session.id, message);
      publish(session.id, {
        type: "message",
        data: { role: "user", content: message },
      });
      return res.status(202).json({
        message,
        sessionId: session.id,
        status: "running",
        queued: true,
      });
    }

    if (session.pendingToolCallId) {
      session.messages.push({
        role: "tool",
        tool_call_id: session.pendingToolCallId,
        content: message,
      });
      session.pendingToolCallId = undefined;
    }
    session.messages.push({ role: "user", content: message });
    publish(session.id, {
      type: "message",
      data: { role: "user", content: message },
    });

    session.logs = [
      ...(session.logs ?? []),
      {
        time: new Date().toISOString(),
        type: "info",
        text: "User message received",
      },
    ];

    setStatus(session, "running");
    await saveSession(session);
    void runAgent(session);

    return res.status(202).json({
      message,
      sessionId: session.id,
      status: "running",
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: "Failed to send message" });
  }
});

app.post("/api/sessions/:sessionId/stop", async (req, res) => {
  const session = await getSession(req.params.sessionId);
  if (
    !req.installationId ||
    !session ||
    session.installationId !== req.installationId
  ) {
    return res.status(404).json({ error: "Session not found" });
  }
  if (session.status !== "running") {
    return res.json({ stopping: false, status: session.status });
  }
  stopAgent(session.id);
  log(session, "info", "Stopped by user");
  setStatus(session, "stopped");
  await saveSession(session);
  return res.json({ stopping: true, status: "stopped" });
});

//still debateable that either we should use SSE or WS
app.get("/api/session/:sessionId/stream", async (req, res) => {
  const installationId = req.installationId;
  const session = await getSession(req.params.sessionId);

  if (
    !installationId ||
    !session ||
    session.installationId !== installationId
  ) {
    return res.status(404).json({ error: "Session not found" });
  }

  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  res.flushHeaders();

  const send = (event: string, data: unknown, id?: number) => {
    if (id !== undefined) res.write(`id: ${id}\n`);
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const lastId = Number(req.header("last-event-id"));
  const start = Number.isInteger(lastId) ? lastId + 1 : 0;
  session.logs
    .slice(start)
    .forEach((entry, i) => send("log", entry, start + i));
  send("status", {
    status: session.status,
    prUrl: session.prUrl,
    branch: session.branch,
  });

  const unsubscribe = subscribe(session.id, (e) => send(e.type, e.data, e.id));

  const heartbeat = setInterval(() => res.write(": ping\n\n"), 25_000);

  res.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

app.get("/api/sessions/:sessionId/stream", async (req, res) => {
  const session = await getSession(req.params.sessionId);
  const installationId = req.installationId;
  if (!session || session?.installationId !== installationId) {
    return res.status(404).json({ error: "Session not found" });
  }

  const abort = new AbortController();
  req.on("close", () => abort.abort());

  try {
    const sandbox = await connectSessionSandbox(session.sandboxId);
    await ensureRelay(sandbox, session.id, "http://localhost:3000");

    //I receive the stream as upstream from the sandbox and pipe it to the user
    const upstream = await connectUpStream(
      `https://${sandbox.getHost(RELAY_PORT)}/`,
      abort.signal,
    );

    res.writeHead(200, {
      "Content-Type":
        upstream.headers.get("Content-Type") ??
        "multipart/x-mixed-replace; boundary=frame",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    });

    const body = Readable.fromWeb(upstream.body as any);
    body.on("error", () => res.send());
    body.pipe(res);
  } catch (error) {
    if (!res.headersSent)
      res.status(502).json({
        error: "Browser stream unavailable",
      });
  }
});

app.post("/api/app/sessions/:sessionId/pull-request", async (req, res) => {
  const session = await loadOwned(req, res);
  if (!session) return;

  if (session.status === "running") {
    return res.status(409).json({
      error: "Agent is still running",
    });
  }

  if (publishing.has(session.id)) {
    return res.status(409).json({
      error: "Agent publishing",
    });
  }

  publishing.add(session.id);

  try {
    const sandbox = await connectSessionSandbox(session.sandboxId);
    if (session.prUrl) return res.json({ prUrl: session.prUrl });

    const result = await publishChanges(sandbox, session, session.title || "");
    if (!result) {
      return res
        .status(409)
        .json({ error: "There are no changes to publish." });
    }
    if ("unchanged" in result) {
      return res.status(409).json({
        error:
          "The workspace has no new commits or file changes, and the GitHub branch has no commits ahead of the base branch.",
        branch: result.branch,
        commitSha: result.commitSha,
      });
    }
    if (result.prError) {
      return res.status(502).json({
        error: `The commit is on GitHub, but the pull request could not be opened: ${result.prError}`,
        branch: result.branch,
        commitSha: result.commitSha,
      });
    }
    if (!result.prUrl) {
      return res.status(409).json({
        error: "No pull request was created for this branch.",
        branch: result.branch,
        commitSha: result.commitSha,
      });
    }

    await saveSession(session);
    res.status(201).json({ prUrl: result.prUrl });
  } catch (e) {
    if (isSandboxNotFoundError(e)) {
      return res.status(410).json({
        error:
          "This session's workspace has expired. Its unpushed changes are no longer available; start a new session to continue.",
      });
    }
    console.log("Pull-request failed: ", e);
    res.status(500).json({ error: "Failed to create pull request" });
  } finally {
    publishing.delete(session.id);
  }
});

// Merge is a separate, explicit action. Creating or updating a PR never merges it.
app.post(
  "/api/app/sessions/:sessionId/pull-request/merge",
  async (req, res) => {
    const session = await loadOwned(req, res);
    if (!session) return;
    if (req.body?.userApproved !== true) {
      return res
        .status(400)
        .json({
          error:
            "Review the pull request and explicitly confirm before merging.",
        });
    }
    if (!session.prUrl || !session.branch) {
      return res
        .status(409)
        .json({ error: "This session has no pull request to merge." });
    }
    if (session.prMergedAt) {
      return res.json({
        merged: true,
        mergedAt: session.prMergedAt,
        mergeCommitSha: session.prMergeCommitSha,
        baseBranch: session.prBaseBranch ?? "main",
      });
    }
    if (session.status === "running" || publishing.has(session.id)) {
      return res
        .status(409)
        .json({
          error:
            "Wait for the agent to finish before merging this pull request.",
        });
    }

    let pullNumber: number;
    try {
      const prUrl = new URL(session.prUrl);
      const [owner, repo, resource, number] = prUrl.pathname
        .split("/")
        .filter(Boolean);
      if (
        prUrl.hostname !== "github.com" ||
        owner !== session.repoFullName.split("/")[0] ||
        repo !== session.repoFullName.split("/")[1] ||
        resource !== "pull" ||
        !number ||
        !/^\d+$/.test(number)
      ) {
        return res
          .status(400)
          .json({
            error: "The saved pull request URL does not match this repository.",
          });
      }
      pullNumber = Number(number);
    } catch {
      return res
        .status(400)
        .json({ error: "The saved pull request URL is invalid." });
    }

    publishing.add(session.id);
    try {
      const [owner, repo] = session.repoFullName.split("/");
      if (!owner || !repo)
        return res.status(400).json({ error: "Invalid repository name." });
      const octokit = await getInstallationOctokit(session.installationId);
      const { data: repoInfo } = await octokit.rest.repos.get({ owner, repo });
      const { data: pullRequest } = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: pullNumber,
      });

      if (pullRequest.merged_at) {
        session.prMergedAt = pullRequest.merged_at;
        session.prMergeCommitSha = pullRequest.merge_commit_sha ?? undefined;
        session.prBaseBranch = pullRequest.base.ref;
        await saveSession(session);
        return res.json({
          merged: true,
          mergedAt: session.prMergedAt,
          mergeCommitSha: session.prMergeCommitSha,
          baseBranch: session.prBaseBranch,
        });
      }
      if (pullRequest.state !== "open") {
        return res
          .status(409)
          .json({ error: "This pull request is closed and cannot be merged." });
      }
      if (
        pullRequest.head.ref !== session.branch ||
        pullRequest.base.ref !== repoInfo.default_branch
      ) {
        return res
          .status(409)
          .json({
            error:
              "The pull request branch or target changed. Review it on GitHub before merging.",
          });
      }
      if (pullRequest.mergeable === false) {
        return res
          .status(409)
          .json({
            error:
              "This pull request has merge conflicts. Resolve them on GitHub and review again.",
          });
      }

      const { data: merge } = await octokit.rest.pulls.merge({
        owner,
        repo,
        pull_number: pullNumber,
        sha: pullRequest.head.sha,
        merge_method: "merge",
      });
      session.prMergedAt = new Date().toISOString();
      session.prMergeCommitSha = merge.sha;
      session.prBaseBranch = pullRequest.base.ref;
      log(
        session,
        "info",
        `Pull request #${pullNumber} merged into ${pullRequest.base.ref} as ${merge.sha}`,
      );
      await saveSession(session);
      return res.json({
        merged: true,
        mergedAt: session.prMergedAt,
        mergeCommitSha: merge.sha,
        baseBranch: session.prBaseBranch,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "GitHub could not merge this pull request.";
      return res.status(502).json({ error: `Merge failed: ${message}` });
    } finally {
      publishing.delete(session.id);
    }
  },
);

app.post("/api/app/sessions/:sessionId/deploy", async (req, res) => {
  const session = await loadOwned(req, res);
  if (!session) return;

  if (session.status === "running") {
    return res.status(409).json({ error: "Agent is still running" });
  }

  const target = req.body?.target === "vercel" ? "vercel" : "preview";

  try {
    const sandbox = await connectSessionSandbox(session.sandboxId);

    if (target === "preview") {
      if (!session.previewStarted) {
        return res.status(409).json({ error: "Start the preview first." });
      }
      const config = await getRepoConfig(
        session.installationId,
        session.repoFullName,
      );
      const port = Number(config?.port);
      return res.json({
        url: `https://${sandbox.getHost(port)}`,
        temporary: true,
      });
    }

    // Needs the vercel CLI inside the E2B template (npm i -g vercel).
    const token = process.env.VERCEL_TOKEN;
    if (!token) {
      return res
        .status(501)
        .json({ error: "Vercel deploy is not configured on the server." });
    }

    const project = (
      "agent-" + session.repoFullName.toLowerCase().replace(/[^a-z0-9]+/g, "-")
    )
      .replace(/-+$/, "")
      .slice(0, 100);
    if (!SAFE.test(project))
      return res.status(500).json({ error: "Bad project name." });

    const opts = { cwd: REPO_DIR, envs: { VERCEL_TOKEN: token } };

    await sandbox.commands.run(`vercel link --yes --project ${project}`, {
      ...opts,
      timeoutMs: 2 * 60_000,
    });
    const out = await sandbox.commands.run("vercel deploy --yes", {
      ...opts,
      timeoutMs: 10 * 60_000,
    });

    const match = out.stdout.match(/https:\/\/[^\s]+\.vercel\.app/);
    if (!match)
      return res
        .status(502)
        .json({ error: "Deployed, but could not read the URL." });

    session.deployUrl = match[0];
    await saveSession(session);
    res.json({ url: session.deployUrl, temporary: false });
  } catch (err: any) {
    if (isSandboxNotFoundError(err)) {
      return res.status(410).json({
        error:
          "This session's workspace has expired. Start a new session to deploy the repository.",
      });
    }
    console.error("Deploy failed", err);
    res.status(500).json({
      error: "Deploy failed.",
      detail: String(err.stderr ?? err.message).slice(-500),
    });
  }
});

try {
  await prisma.$connect();
  await migrateLegacyJsonData();
  const port = Number(process.env.PORT || process.env.SERVER_PORT || 3001);
  app.listen(port, "0.0.0.0", () => {
    console.log(`server is up and running on port ${port}`);
  });
} catch (error) {
  console.error("Could not initialize PostgreSQL persistence:", error);
  process.exitCode = 1;
}
