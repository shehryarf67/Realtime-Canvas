import type { Request, Response, NextFunction } from "express";

export default function requireAuth(req: Request, res: Response, next: NextFunction) {
    // TODO: Step 1 — read the token cookie, return 401 if missing
    // TODO: Step 2 — jwt.verify the token, attach the decoded userId to req.userId
    // TODO: Step 3 — call next() on success, or respond 401 in the catch block
}
