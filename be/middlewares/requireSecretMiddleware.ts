import type { Request, Response, NextFunction } from "express"
import { timingSafeEqual } from 'crypto';

export function requireSecret(req: Request, res: Response, next: NextFunction) {
    const given = Buffer.from(req.header('x-sandbox-secret') ?? '');
    const expected = Buffer.from(process.env.SANDBOX_SECRET ?? '');
    if (!expected.length || given.length !== expected.length || !timingSafeEqual(given, expected)) {
        return res.sendStatus(401);
    }
    next();
}