import { Router } from "express";
import { Sandbox } from "e2b";
import { getSession } from "../session";
import { executeTool } from "../agent";
import { appendLog } from "../session";
import { requireSecret } from "../middlewares/requireSecretMiddleware";

const router = Router();

const KINDS = new Set(["error", "screenshot", "log"]);
const MAX_PAYLOAD = 20_000;

router.use(requireSecret);

// POST /internal/sandbox/exec  — worker -> API: run one tool call
router.post("/exec", async (req, res) => {
  const { sessionId, tool, args } = req.body ?? {};
  const session = await getSession(sessionId);
  if (!session) return res.sendStatus(404);

  try {
    const sandbox = await Sandbox.connect(session.sandboxId);
    const result = await executeTool(sandbox, tool, args);
    res.json({ result });
  } catch (err) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /internal/sandbox/callback  — sandbox -> API: async events (crashes, screenshots, logs)

router.post("/callback", async (req, res) => {
  const { sessionId, kind, payload } = req.body ?? {};
  const session = await getSession(sessionId);
  if (!session) return res.sendStatus(404);
  if (!KINDS.has(kind)) return res.status(400).json({ error: "Unknown kind" });

  const text = typeof payload === "string" ? payload : JSON.stringify(payload);
  appendLog(session.id, { kind, payload: text.slice(0, MAX_PAYLOAD) });
  res.sendStatus(204);
});

export default router;
