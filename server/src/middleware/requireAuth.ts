import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;

export default function requireAuth(req: Request, res: Response, next: NextFunction) {
    // TODO: Step 1 — read the token cookie, return 401 if missing
    const token = req.cookies.token;
    if (!token) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    // TODO: Step 2 — jwt.verify the token, attach the decoded userId to req.userId
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; name: string; email: string };
    } catch {
        return res.status(401).json({ error: "Invalid or expired token" });
    }
    // TODO: Step 3 — call next() on success, or respond 401 in the catch block
    next();
}
