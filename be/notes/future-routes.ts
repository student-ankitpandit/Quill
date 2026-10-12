import { Router } from 'express';
import type { Request, Response, NextFunction } from "express"
import { timingSafeEqual } from 'crypto';
import { getSession } from '../session';
import { executeTool } from '../agent';
import { appendLog } from '../session';

const router = Router();

function requireSecret(req: Request, res: Response, next: NextFunction) {
  const given = Buffer.from(req.header('x-sandbox-secret') ?? '');
  const expected = Buffer.from(process.env.SANDBOX_SECRET ?? '');
  if (!expected.length || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return res.sendStatus(401);
  }
  next();
}

router.use(requireSecret);

// POST /internal/sandbox/exec  — worker -> API: run one tool call
router.post('/exec', async (req, res) => {
  const { sessionId, tool, args } = req.body ?? {};
  const session = getSession(sessionId);
  if (!session) return res.sendStatus(404);

  try {
    const result = await executeTool(session, tool, args);
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /internal/sandbox/callback  — sandbox -> API: async events (crashes, screenshots, logs)
const KINDS = new Set(['error', 'screenshot', 'log']);
const MAX_PAYLOAD = 20_000;

router.post('/callback', async (req, res) => {
  const { sessionId, kind, payload } = req.body ?? {};
  const session = await getSession(sessionId);
  if (!session) return res.sendStatus(404);
  if (!KINDS.has(kind)) return res.status(400).json({ error: 'Unknown kind' });

  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  appendLog(session, { kind, payload: text.slice(0, MAX_PAYLOAD) });
  res.sendStatus(204);
});

export default router;