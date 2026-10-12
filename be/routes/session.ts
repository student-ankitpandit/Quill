import type { Request, Response } from "express";
import Router from "express"
import { Sandbox } from "e2b";
import { getSession, saveSession, deleteSession, setStatus } from "../session";
import type { Session } from "../session";
import { getRepoConfig } from "../repo-config";
import { ensureRelay } from "../browser-stream";

const router = Router();

async function loadOwned(req: Request, res: Response): Promise<Session | null> {
  const session = await getSession(req.params.id as string);
  if (!session || session.installationId !== req.installationId) {
    res.sendStatus(404);
    return null;
  }
  return session;
}

async function waitForPort(
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

// POST /api/app/sessions/:id/preview
// Starts the repo's dev server in the background, then the browser relay.
router.post("/:id/preview", async (req, res) => {
    const session = loadOwned(req, res);
    if (!session) return;

    if (session.previewStarted) return res.json({ ready: true });

    const config = await getRepoConfig(session.installationId, session.repoFullName);
    const port = Number(config?.port);
    if (
        !config?.runCommand ||
        !Number.isInteger(port) ||
        port < 1 ||
        port > 65535
    ) {
        return res
        .status(400)
        .json({
            error: "This repo has no run command / port configured for preview.",
        });
    }

    try {
        const sandbox = await Sandbox.connect(session.sandboxId); 

        await sandbox.commands.run(config.runCommand, {
        background: true,
        cwd: session.repoPath,
    });

    const up = await waitForPort(sandbox, port);
    if (!up)
        return res
            .status(504)
            .json({ error: "Dev server did not come up within 60s." });

    await ensureRelay(sandbox, `http://localhost:${port}`);

    session.previewStarted = true;
    saveSession(session);
    res.json({ ready: true });
  } catch (err) {
    console.error("preview failed", err);
    res.status(500).json({ error: "Failed to start preview." });
  }
});

// DELETE /api/app/sessions/:id
// Kills the sandbox (stops billing) and removes the session.
router.delete("/:id", async (req, res) => {
  const session = loadOwned(req, res);
  if (!session) return;

  setStatus(session, "stopped");

  try {
    await Sandbox.kill(session.sandboxId);
  } catch {
    
  }

  deleteSession(session.id);
  res.sendStatus(204);
});

export default router;
