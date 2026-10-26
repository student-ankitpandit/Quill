import OpenAI from "openai";
import { Sandbox } from "e2b";
import type { Session } from "./sessions";
import { saveSession, log, setStatus, redactSensitiveText } from "./sessions";
import {
  connectSessionSandbox,
  getInstallationToken,
  getInstallationOctokit,
  isSandboxNotFoundError,
} from "./lib";
import { publish } from "./events";
import { completeAgentRun, failAgentRun, startAgentRun } from "./agent-runs";
import { prisma } from "./db";

let _openai: OpenAI | null = null;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ timeout: 90_000, maxRetries: 1 });
  return _openai;
}

const MODEL = "gpt-5";
const MAX_ITERATIONS = 30;
export const REPO_DIR = "/home/user/repo";

// session ids the user asked to stop; checked at the top of every loop iteration
export const stopRequests = new Set<string>();
const activeAgentControllers = new Map<string, AbortController>();

export function stopAgent(sessionId: string) {
  stopRequests.add(sessionId);
  activeAgentControllers
    .get(sessionId)
    ?.abort(new DOMException("Stopped by user", "AbortError"));
}
const queuedMessageIds = new Map<string, string[]>();

export async function queueAgentMessage(sessionId: string, message: string) {
  const queued = await prisma.queuedAgentMessage.create({
    data: { sessionId, content: message },
  });
  const ids = queuedMessageIds.get(sessionId) ?? [];
  ids.push(queued.id);
  queuedMessageIds.set(sessionId, ids);
}

async function takeQueuedMessages(sessionId: string, includePending = false) {
  const ids = queuedMessageIds.get(sessionId) ?? [];
  queuedMessageIds.delete(sessionId);
  if (!ids.length && !includePending) return [];
  return prisma.queuedAgentMessage.findMany({
    where: {
      sessionId,
      consumedAt: null,
      ...(ids.length && !includePending ? { id: { in: ids } } : {}),
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

const SYSTEM_PROMPT =
  "You are an agent that can answer questions and make requested code changes. " +
  "For a brief greeting such as hi or hello, greet the user and ask how you can help with the repository, referring to it by its repository name only. Do not include the GitHub owner's username or the full owner/repository identifier. Keep the reply conversational; do not claim repository work was done or mention commits, pushes, or pull requests. " +
  "For a straightforward informational question, answer it directly in plain language. Do not call tools, inspect or change files, start services, or create a pull request for an informational question. " +
  "For repository-specific questions, use the repository name and conversation context; be clear about uncertainty instead of inventing details you cannot know without inspection. " +
  "Never claim that changes are on GitHub based on a local git commit. Quill publishes and verifies changes after your response; do not run git push yourself. " +
  "Never merge a pull request automatically. Quill asks the user to review the PR and only merges after the user explicitly confirms through the Merge PR action. " +
  "Use repository tools only when the user explicitly asks you to inspect or change the code. " +
  "If a code task is blocked on information you cannot find yourself, use ask_user.";

function isGreeting(text: string): boolean {
  const normalized = text
    .trim()
    .toLocaleLowerCase()
    .replace(/[.!?,]+$/g, "")
    .replace(/\s+/g, " ");
  return /^(?:(?:hi|hello|hey)(?:\s+(?:there|again|there again|again there))?|good (?:morning|afternoon|evening)|how are you(?: doing)?|what's up)$/.test(
    normalized,
  );
}

export function isInformationalQuestion(text: string): boolean {
  if (isGreeting(text)) return true;
  const normalized = text.trim().toLocaleLowerCase();
  const isQuestion =
    /^(?:(?:can|could|would)\s+you\s+)?(?:please\s+)?(?:explain|describe|summari[sz]e|tell\s+me|what|why|how|who|where|when|which|is|are|do|does|did)\b/.test(
      normalized,
    );
  const requestsCodeWork =
    /\b(fix|implement|change|add|remove|update|refactor|write|create|build|debug|test|run|install|deploy|modify|edit)\b/.test(
      normalized,
    );
  return isQuestion && !requestsCodeWork;
}

export async function answerSideChat(
  session: Session,
  question: string,
): Promise<string> {
  const context = session.messages
    .filter(
      (message) =>
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim(),
    )
    .slice(-16)
    .map((message) => ({
      role: message.role as "user" | "assistant",
      content: message.content as string,
    }));
  const run = await startAgentRun(session.id, "openai", MODEL);
  let response: OpenAI.Chat.Completions.ChatCompletion;
  try {
    response = await getOpenAI().chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `You are Quill's side chat for repository ${session.repoFullName}. Answer the user's follow-up using the conversation context below. This is a separate discussion: do not run tools, modify the repository, change the main conversation, or claim work was performed. If the context does not contain enough information, say so plainly.`,
        },
        ...context,
        { role: "user", content: question },
      ],
    });
    await completeAgentRun(run.id, response);
  } catch (error) {
    await failAgentRun(run.id, error);
    throw error;
  }
  return (
    response.choices[0]?.message.content?.trim() ||
    "I could not generate a reply. Please try again."
  );
}

const tools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "run_command",
      description: "Run a shell command in the repo root",
      parameters: {
        type: "object",
        properties: { command: { type: "string" } },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a file, path relative to repo root",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Overwrite a file, path relative to repo root",
      parameters: {
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string" } },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ask_user",
      description:
        "Ask the user a question when blocked on information you cannot find yourself. Your turn ends until they answer.",
      parameters: {
        type: "object",
        properties: { question: { type: "string" } },
        required: ["question"],
      },
    },
  },
];

export async function executeTool(
  sandbox: Sandbox,
  name: string,
  input: any,
  signal?: AbortSignal,
): Promise<string> {
  try {
    if (signal?.aborted) throw signal.reason;
    if (name === "run_command") {
      const r = await sandbox.commands.run(input.command, {
        cwd: REPO_DIR,
        timeoutMs: 120_000,
        signal,
      });
      return (r.stdout + r.stderr).slice(-8000);
    }
    if (name === "read_file") {
      return (await sandbox.files.read(`${REPO_DIR}/${input.path}`)).slice(
        0,
        20_000,
      );
    }
    if (name === "write_file") {
      await sandbox.files.write(`${REPO_DIR}/${input.path}`, input.content);
      return "ok";
    }
    return `Unknown tool: ${name}`;
  } catch (err: any) {
    if (signal?.aborted) throw signal.reason ?? err;
    return `Error: ${err.message}\n${err.stdout ?? ""}${err.stderr ?? ""}`.slice(
      -8000,
    );
  }
}

type PublishedChanges =
  | { branch: string; commitSha: string; prUrl?: string; prError?: string }
  | { unchanged: true; branch: string; commitSha: string };

// First run: puts all work, including agent-created local commits, on a branch,
// pushes it, and opens a PR. Later runs push follow-up commits to that branch.
export async function publishChanges(
  sandbox: Sandbox,
  session: Session,
  summary: string,
  signal?: AbortSignal,
): Promise<PublishedChanges | null> {
  const run = (cmd: string) => {
    if (signal?.aborted) throw signal.reason;
    return sandbox.commands.run(cmd, {
      cwd: REPO_DIR,
      timeoutMs: 30_000,
      signal,
    });
  };
  const token = await getInstallationToken(session.installationId);
  const [owner, repo] = session.repoFullName.split("/");
  if (!owner || !repo)
    throw new Error(`Invalid repository name: ${session.repoFullName}`);
  const authenticatedRemote = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
  const publicRemote = `https://github.com/${owner}/${repo}.git`;
  await run(`git remote set-url origin '${authenticatedRemote}'`);

  const isFirst = !session.branch;
  const shouldOpenPullRequest = !session.prUrl;
  const taskSlug =
    (session.issueNumber
      ? `issue-${session.issueNumber}`
      : session.title || "task"
    )
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "task";
  let commitSha = "";
  let branch = session.branch ?? "";
  let pushed = false;
  try {
    const branchResult = await run("git branch --show-current");
    const currentBranch = branchResult.stdout.trim();
    const defaultRefResult = await run(
      "git symbolic-ref --short refs/remotes/origin/HEAD || echo origin/main",
    );
    const defaultRef = defaultRefResult.stdout.trim() || "origin/main";
    const defaultBranch = defaultRef.replace(/^origin\//, "");
    await run(`git check-ref-format --branch '${defaultBranch}'`);
    // ls-remote returns commit IDs without downloading their Git objects. Fetch
    // into private refs before using those commits in rev-list/rev-parse ranges.
    const baseRef = "refs/quill/publish-base";
    await run(
      `git fetch --no-tags origin '+refs/heads/${defaultBranch}:${baseRef}'`,
    );
    const defaultSha = (
      await run(`git rev-parse '${baseRef}^{commit}'`)
    ).stdout.trim();
    if (!defaultSha)
      throw new Error(`Could not resolve GitHub's ${defaultBranch} branch`);
    const requestedBranch =
      session.branch ??
      (currentBranch && currentBranch !== defaultBranch
        ? currentBranch
        : `quill-agent-${taskSlug}-${Date.now()}`);
    // Git refs cannot have both `agent` and `agent/<name>`: the former is a
    // file-like ref while the latter needs it to be a directory. Older Quill
    // sessions used the nested form, so move those sessions to a flat branch
    // name when the existing `agent` branch causes the namespace conflict.
    const agentRoot = await run(
      "git ls-remote --heads origin 'refs/heads/agent'",
    );
    const targetBranch =
      requestedBranch.startsWith("agent/") && agentRoot.stdout.trim()
        ? `quill-agent-${taskSlug}-${Date.now()}`
        : requestedBranch;
    await run(`git check-ref-format --branch '${targetBranch}'`);
    branch = targetBranch;

    const status = await run("git status --porcelain");
    const hasUncommittedChanges = Boolean(status.stdout.trim());
    const remoteBranch = await run(
      `git ls-remote --heads origin 'refs/heads/${targetBranch}'`,
    );
    const advertisedRemoteSha =
      remoteBranch.stdout.trim().split(/\s+/)[0] || "";
    const targetRef = "refs/quill/publish-target";
    if (advertisedRemoteSha) {
      await run(
        `git fetch --no-tags origin '+refs/heads/${targetBranch}:${targetRef}'`,
      );
    }
    const remoteSha = advertisedRemoteSha
      ? (await run(`git rev-parse '${targetRef}^{commit}'`)).stdout.trim()
      : "";
    const compareRef = remoteSha ? targetRef : baseRef;
    const ahead = await run(`git rev-list --count '${compareRef}..HEAD'`);
    const unpushedCommitCount = Number.parseInt(ahead.stdout.trim(), 10) || 0;
    const remoteAheadResult = remoteSha
      ? await run(`git rev-list --count '${baseRef}..${targetRef}'`)
      : { stdout: "0" };
    const remoteCommitCount =
      Number.parseInt(remoteAheadResult.stdout.trim(), 10) || 0;

    if (!hasUncommittedChanges && unpushedCommitCount === 0) {
      if (remoteCommitCount === 0 || !remoteSha) {
        const headSha = (await run("git rev-parse HEAD")).stdout.trim();
        log(
          session,
          "info",
          `Nothing new to publish: clean workspace at ${headSha.slice(0, 7)} on ${currentBranch || "detached HEAD"}`,
        );
        return {
          unchanged: true,
          branch: currentBranch || defaultBranch,
          commitSha: headSha,
        };
      }

      // The branch already has a real commit on GitHub. Reuse it to create a
      // missing PR instead of treating a clean sandbox as a failed retry.
      commitSha = remoteSha;
      pushed = true;
      log(
        session,
        "info",
        `Found existing GitHub commit ${commitSha.slice(0, 7)} on ${targetBranch}; continuing with PR creation`,
      );
    }

    if (session.branch !== targetBranch) {
      session.branch = targetBranch;
      await saveSession(session);
    }

    if (!pushed) {
      if (targetBranch !== currentBranch) {
        const existingBranch = await run(
          `git show-ref --verify --quiet 'refs/heads/${targetBranch}' && echo yes || echo no`,
        );
        await run(
          existingBranch.stdout.trim() === "yes"
            ? `git checkout '${targetBranch}'`
            : `git checkout -b '${targetBranch}'`,
        );
      }

      if (hasUncommittedChanges) {
        await run(
          'git config user.name "cloud-agent" && git config user.email "agent@users.noreply.github.com"',
        );
        const msg = isFirst
          ? `Agent work: ${taskSlug}`
          : `Follow-up: ${taskSlug}`;
        await run(`git add -A && git commit -m "${msg}"`);
      }

      await run(`git push --set-upstream origin '${branch}'`);
      commitSha = (await run("git rev-parse HEAD")).stdout.trim();
      const remoteHead = await run(
        `git ls-remote origin 'refs/heads/${branch}'`,
      );
      const pushedSha = remoteHead.stdout.trim().split(/\s+/)[0];
      if (!commitSha || pushedSha !== commitSha) {
        throw new Error(
          `GitHub did not confirm commit ${commitSha || "(unknown)"}`,
        );
      }
      pushed = true;
      log(
        session,
        "info",
        `Verified commit ${commitSha.slice(0, 7)} on GitHub branch ${branch}`,
      );
    }
  } finally {
    // Do not leave the installation token persisted in the sandbox's git config.
    await sandbox.commands
      .run(`git remote set-url origin '${publicRemote}'`, {
        cwd: REPO_DIR,
        timeoutMs: 5_000,
      })
      .catch(() => undefined);
  }
  if (!pushed) return null;

  let prError: string | undefined;
  if (shouldOpenPullRequest) {
    try {
      const octokit = await getInstallationOctokit(session.installationId);
      const { data: repoInfo } = await octokit.rest.repos.get({ owner, repo });
      const pullRequestTitle =
        (session.title || summary || `Changes for ${repo}`)
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 256) || `Changes for ${repo}`;
      const { data: pr } = await octokit.rest.pulls.create({
        owner,
        repo,
        head: branch,
        base: repoInfo.default_branch,
        title: pullRequestTitle,
        body: [
          summary ||
            `Automated changes for ${session.title || session.repoFullName}.`,
          session.issueNumber ? `Closes #${session.issueNumber}` : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
      });
      session.prUrl = pr.html_url;
      session.prBaseBranch = repoInfo.default_branch;
      log(session, "info", `Opened PR: ${pr.html_url}`);
    } catch (error) {
      prError = error instanceof Error ? error.message : String(error);
      log(
        session,
        "error",
        `Commit is on GitHub, but the pull request could not be opened: ${prError}`,
      );
    }
  }
  return { branch, commitSha, prUrl: session.prUrl, prError };
}

// The agent loop. Callers set session.status = 'running' and save BEFORE calling this,
// and should call it without await (it takes minutes): void runAgent(session)
export async function runAgent(session: Session, parentSignal?: AbortSignal) {
  const controller = parentSignal ? null : new AbortController();
  const signal = parentSignal ?? controller!.signal;
  let publishingChanges = false;
  if (controller) {
    if (activeAgentControllers.has(session.id)) return;
    activeAgentControllers.set(session.id, controller);
  }
  try {
    let sandbox: Sandbox | null = null;
    let summary = "";
    let finished = false;
    let finalTurnIsInformational = false;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const queuedAtStart = await takeQueuedMessages(session.id, i === 0);
      if (queuedAtStart.length) {
        session.messages.push(
          ...queuedAtStart.map((queued) => ({
            role: "user" as const,
            content: queued.content,
          })),
        );
        await saveSession(
          session,
          queuedAtStart.map((queued) => queued.id),
        );
      }

      if (signal.aborted || stopRequests.delete(session.id)) {
        log(session, "info", "Stopped by user");
        setStatus(session, "stopped");
        await saveSession(session);
        return;
      }

      const latestUserMessage = [...session.messages]
        .reverse()
        .find((message) => message.role === "user");
      const userText =
        typeof latestUserMessage?.content === "string"
          ? latestUserMessage.content
          : "";
      finalTurnIsInformational = isInformationalQuestion(userText);

      if (isGreeting(userText)) {
        const queuedMessages = await takeQueuedMessages(session.id);
        if (queuedMessages.length) {
          session.messages.push(
            ...queuedMessages.map((queued) => ({
              role: "user" as const,
              content: queued.content,
            })),
          );
          await saveSession(
            session,
            queuedMessages.map((queued) => queued.id),
          );
          continue;
        }

        const repoName = session.repoFullName.split("/").pop() || "repository";
        const greeting = `Hi! How can I help with the ${repoName} repository?`;
        session.messages.push({ role: "assistant", content: greeting });
        publish(session.id, {
          type: "message",
          data: { role: "assistant", content: greeting },
        });
        setStatus(session, "done");
        await saveSession(session);
        return;
      }

      const agentRun = await startAgentRun(session.id, "openai", MODEL);
      let response: OpenAI.Chat.ChatCompletion;
      try {
        response = await getOpenAI().chat.completions.create(
          {
            model: MODEL,
            messages: [
              {
                role: "system",
                content: `${SYSTEM_PROMPT}\nRepository: ${session.repoFullName}.`,
              },
              ...session.messages,
            ],
            ...(finalTurnIsInformational
              ? {}
              : {
                  tools,
                  tool_choice: "auto" as const,
                  parallel_tool_calls: false,
                }),
          },
          { signal },
        );
        await completeAgentRun(agentRun.id, response);
      } catch (error) {
        await failAgentRun(agentRun.id, error);
        throw error;
      }
      if (signal.aborted) throw signal.reason;

      const firstChoice = response.choices[0];
      if (!firstChoice) {
        throw new Error("OpenAI returned no completion choices");
      }
      const choice = firstChoice.message;
      session.messages.push(choice);
      if (typeof choice.content === "string" && choice.content.trim()) {
        publish(session.id, {
          type: "message",
          data: { role: "assistant", content: choice.content },
        });
      }

      const toolCall = choice.tool_calls?.[0];
      if (!toolCall || toolCall.type !== "function") {
        const queuedAfterResponse = await takeQueuedMessages(session.id);
        if (queuedAfterResponse.length) {
          session.messages.push(
            ...queuedAfterResponse.map((queued) => ({
              role: "user" as const,
              content: queued.content,
            })),
          );
          await saveSession(
            session,
            queuedAfterResponse.map((queued) => queued.id),
          );
          continue;
        }
        // no tool call means the agent considers itself done
        summary = choice.content ?? "";
        finished = true;
        break;
      }

      let args: any;
      try {
        args = JSON.parse(toolCall.function.arguments || "{}");
      } catch {
        session.messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: "Error: tool arguments were not valid JSON",
        });
        continue;
      }

      if (toolCall.function.name === "ask_user") {
        if (typeof args.question === "string") {
          choice.content = args.question;
          log(session, "info", `Agent asks: ${args.question}`);
          publish(session.id, {
            type: "message",
            data: { role: "assistant", content: args.question },
          });
        } else {
          log(session, "info", "Agent is waiting for your input");
        }
        setStatus(session, "waiting_for_input");
        session.pendingToolCallId = toolCall.id;
        await saveSession(session);
        return; // pauses here until /messages answers it
      }

      log(
        session,
        "tool_call",
        redactSensitiveText(
          `${toolCall.function.name} ${toolCall.function.arguments}`,
        ),
      );
      sandbox ??= await connectSessionSandbox(session.sandboxId);
      const output = redactSensitiveText(
        await executeTool(sandbox, toolCall.function.name, args, signal),
      );
      log(session, "tool_result", output);

      session.messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: output,
      });
      await saveSession(session); // persist every iteration so the UI can poll progress
    }

    if (!finished)
      log(session, "info", `Reached the ${MAX_ITERATIONS}-iteration limit`);

    const queuedBeforePublish = await takeQueuedMessages(session.id);
    if (queuedBeforePublish.length) {
      session.messages.push(
        ...queuedBeforePublish.map((queued) => ({
          role: "user" as const,
          content: queued.content,
        })),
      );
      await saveSession(
        session,
        queuedBeforePublish.map((queued) => queued.id),
      );
      return runAgent(session, signal);
    }

    if (!finalTurnIsInformational) {
      if (signal.aborted) throw signal.reason;
      if (summary.trim()) {
        const progress =
          "I’ve finished the repository work. I’m checking the workspace and GitHub publication now.";
        session.messages.push({ role: "assistant", content: progress });
        publish(session.id, {
          type: "message",
          data: { role: "assistant", content: progress },
        });
        await saveSession(session);
      }
      sandbox ??= await connectSessionSandbox(session.sandboxId);
      publishingChanges = true;
      const published = await publishChanges(sandbox, session, summary, signal);
      publishingChanges = false;
      if (published && "unchanged" in published) {
        const confirmation = `No new GitHub commit was created or pushed. The sandbox has no uncommitted changes or commits ahead of ${published.branch === "main" ? "main" : "the repository branch"}; its current commit is ${published.commitSha.slice(0, 7)} on ${published.branch}. If you expected code changes, they are not present in this session workspace.`;
        session.messages.push({ role: "assistant", content: confirmation });
        publish(session.id, {
          type: "message",
          data: { role: "assistant", content: confirmation },
        });
        await saveSession(session);
      } else if (published && !("unchanged" in published)) {
        const confirmation = `Verified on GitHub: commit ${published.commitSha.slice(0, 7)} was pushed to branch ${published.branch}.${published.prUrl ? ` Pull request: ${published.prUrl}. Please review the changes and checks; Quill will merge it only after you explicitly confirm.` : ""}${published.prError ? ` The commit is available, but Quill could not open a pull request: ${published.prError}` : ""}`;
        session.messages.push({ role: "assistant", content: confirmation });
        publish(session.id, {
          type: "message",
          data: { role: "assistant", content: confirmation },
        });
        await saveSession(session);
      }
    }
    const queuedAfterPublish = await takeQueuedMessages(session.id);
    if (queuedAfterPublish.length) {
      session.messages.push(
        ...queuedAfterPublish.map((queued) => ({
          role: "user" as const,
          content: queued.content,
        })),
      );
      await saveSession(
        session,
        queuedAfterPublish.map((queued) => queued.id),
      );
      return runAgent(session, signal);
    }
    setStatus(session, "done");
    await saveSession(session);
  } catch (err: any) {
    if (signal.aborted || err?.name === "AbortError") {
      if (session.status !== "stopped") {
        log(session, "info", "Stopped by user");
        setStatus(session, "stopped");
      }
      await saveSession(session);
      return;
    }
    const workspaceExpired = isSandboxNotFoundError(err);
    if (workspaceExpired) {
      const message = `This session's sandbox has expired and is no longer available. Quill cannot access or publish any unpushed changes left in that sandbox. Start a new session to continue from the repository on GitHub.`;
      session.messages.push({ role: "assistant", content: message });
      publish(session.id, {
        type: "message",
        data: { role: "assistant", content: message },
      });
      log(session, "error", message);
    } else if (publishingChanges) {
      const details = redactSensitiveText(
        [err.message, err.stderr, err.stdout]
          .filter((value) => typeof value === "string" && value.trim())
          .join("\n"),
      ).slice(-1200);
      const publicationFailure = `GitHub could not confirm the push. The changes may still be in this session workspace, but they are not confirmed on the repository: ${details || "unknown publishing error"}`;
      session.messages.push({ role: "assistant", content: publicationFailure });
      publish(session.id, {
        type: "message",
        data: { role: "assistant", content: publicationFailure },
      });
    }
    if (!workspaceExpired) {
      const details = redactSensitiveText(
        [err.message, err.stderr, err.stdout]
          .filter((value) => typeof value === "string" && value.trim())
          .join("\n") || String(err),
      ).slice(-1200);
      console.error("Agent failed:", details);
      log(session, "error", details);
    }
    setStatus(session, "error");
    await saveSession(session);
  } finally {
    if (controller && activeAgentControllers.get(session.id) === controller) {
      activeAgentControllers.delete(session.id);
      queuedMessageIds.delete(session.id);
      stopRequests.delete(session.id);
    }
  }
}
