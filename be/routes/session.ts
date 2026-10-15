import Router from "express"
import { Sandbox } from "e2b";
import { saveSession, deleteSession, setStatus } from "../session";
import { getRepoConfig } from "../repo-config";
import { ensureRelay } from "../browser-stream";
import { loadOwned }from "../lib"
import {waitForPort } from "../lib"

const router = Router();

// Starts the repo's dev server in the background, then the browser relay.
router.post("/:sessionId/preview", async (req, res) => {
    const session = await loadOwned(req, res);
    if (!session) return;

    const config = await getRepoConfig(session.installationId, session.repoFullName);
    if (!config?.runCommand || config.port === undefined) {
        return res.status(400).json({
            error: "Repository preview configuration is incomplete.",
        });
    }
    const port = config.port;
    const hasUI = config.hasUI !== false; // default true, so existing repo configs behave as before

    try {
        const sandbox = await Sandbox.connect(session.sandboxId); // older SDKs: Sandbox.reconnect
    const url = `https://${sandbox.getHost(port)}`;

    if (session.previewStarted) return res.json({ ready: true, hasUI, url });

    await sandbox.commands.run(config.runCommand, {
        background: true,
        cwd: '/home/user/repo',
    });

    const up = await waitForPort(sandbox, port);
    if (!up) {
        return res.status(504).json({
            error: 'Server did not come up within 60s. It must listen on 0.0.0.0, not localhost.',
        });
    }

    if (hasUI) await ensureRelay(sandbox, session.id, `http://localhost:${port}`);

    session.previewStarted = true;
    await saveSession(session);
    res.json({ ready: true, hasUI, url });
    } catch (err) {
        console.error("Preview failed", err);
        res.status(500).json({ error: "Failed to start preview." });
    }
});

// Kills the sandbox (stops billing) and removes the session.
router.delete("/:sessionId", async (req, res) => {
    const session = await loadOwned(req, res);
    if (!session) return;

    setStatus(session, "stopped");

    try {
        await Sandbox.kill(session.sandboxId);
    } catch {
        // already expired or killed, nothing to clean up
    }

    deleteSession(session.id);
    res.sendStatus(204);
});

export default router;
