import type { Request, Response, NextFunction } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { storage } from "../storage";

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const token = req.headers.authorization;

    if (!token) {
      return res.status(403).json({
        error: "You're Unauthorized, Please login.",
      });
    }

    const decodedToken = jwt.verify(token, process.env.GITHUB_PRIVATE_KEY!) as JwtPayload & {
      installationId?: string;
      userId?: string;
      login?: string;
      name?: string;
      email?: string;
    };

    req.userId = decodedToken.userId ?? "";
    req.login = decodedToken.login;
    req.name = decodedToken.name;
    req.email = decodedToken.email;
    req.installationId = decodedToken.installationId ?? "";

    if (!req.installationId && req.userId) {
      try {
        const existing = await storage.findByUserId(req.userId);
        if (existing?.installation_id) {
          req.installationId = existing.installation_id;
        }
      } catch (error) {
        console.warn("Could not restore GitHub App installation from storage", error);
      }
    }

    return next();
  } catch (e) {
    console.log(e);
    return res.status(403).json({
      error: "Invalid or Expired token",
    });
  }
};
