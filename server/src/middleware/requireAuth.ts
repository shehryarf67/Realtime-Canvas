import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../lib/auth.js";

export default async function requireAuth(req: Request, res: Response, next: NextFunction) {
    const token = req.cookies.token;
    if (!token) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    // verifyToken checks the signature AND that the token hasn't been
    // superseded by a tokenVersion bump (e.g. password reset).
    const payload = await verifyToken(token);
    if (!payload) {
        return res.status(401).json({ error: "Invalid or expired token" });
    }

    req.userId = payload.userId;
    req.userEmail = payload.email;
    next();
}
