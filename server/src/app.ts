import express from "express";
import cookieParser from "cookie-parser";
import { CLIENT_ORIGIN } from "./config.js";
import authRouter from "./routes/auth.js";
import boardsRouter from "./routes/boards.js";

// The Express app on its own — no listen(), no Socket.IO, no DB connect.
// index.ts composes those for the real server; tests mount this directly
// with supertest against an in-memory MongoDB.
export function buildApp(): express.Express {
  const app = express();

  // Production runs behind the host's reverse proxy (Railway/Render/Fly).
  // One hop means req.ip / req.secure reflect the real client (needed for
  // rate limiting and Secure cookies) instead of the proxy itself.
  app.set("trust proxy", 1);

  app.use(express.json());
  app.use(cookieParser());
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", CLIENT_ORIGIN);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    // Tell caches the response varies by requesting origin, so a CDN never
    // serves one origin's CORS headers to another.
    res.setHeader("Vary", "Origin");
    // Preflights don't need to reach the routers — answer them here.
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // For the hosting platform's health probes and uptime monitoring.
  app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.use("/auth", authRouter);
  app.use("/boards", boardsRouter);

  return app;
}
