import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config.js";

export default function requireAuth(req: Request, res: Response, next: NextFunction) {
    const token = req.cookies.token;
    if (!token) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; name: string; email: string };
        req.userId = decoded.userId;

    } catch {
        return res.status(401).json({ error: "Invalid or expired token" });
    }

    next();
}
