import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { CLIENT_ORIGIN } from "./config.js";
import authRouter from "./routes/auth.js";
import boardsRouter from "./routes/boards.js";
import { logger } from "./lib/logger.js";

// Defense-in-depth against CSRF. In production the auth cookie is
// SameSite=None (frontend and API are on different domains), so it rides
// cross-site requests. State-changing requests are already largely protected
// because they require application/json (which forces a CORS preflight our
// single-origin policy blocks), but this makes it explicit: any mutating
// request that carries a browser Origin must match the configured client.
// Requests with no Origin (server-to-server, curl, health checks) are allowed.
const MUTATING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const enforceOrigin: RequestHandler = (req, res, next) => {
  if (!MUTATING_METHODS.has(req.method)) return next();
  const origin = req.headers.origin;
  if (origin && origin !== CLIENT_ORIGIN) {
    res.status(403).json({ error: "Cross-origin request blocked" });
    return;
  }
  next();
};

// Catches anything a route throws or rejects with (Express 5 forwards async
// rejections here automatically). Logs the real error server-side but returns
// a generic message so internals/stack traces never reach the client.
const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  logger.error("Unhandled request error", { err });
  // If the response already started streaming, we can't change the status —
  // hand off to Express's default handler to close the connection.
  if (res.headersSent) {
    return next(err);
  }
  // Honor an explicit client-error status (e.g. a malformed-JSON body parse
  // error is a 400); anything 5xx or unlabeled is reported generically so no
  // stack trace or internal detail leaks to the client.
  const status = (err as { status?: number; statusCode?: number })?.status
    ?? (err as { statusCode?: number })?.statusCode;
  if (typeof status === "number" && status >= 400 && status < 500) {
    res.status(status).json({ error: (err as Error).message || "Bad request" });
    return;
  }
  res.status(500).json({ error: "Something went wrong" });
};

// The Express app on its own — no listen(), no Socket.IO, no DB connect.
// index.ts composes those for the real server; tests mount this directly
// with supertest against an in-memory MongoDB.
export function buildApp(): express.Express {
  const app = express();

  // Production runs behind the host's reverse proxy (Railway/Render/Fly).
  // One hop means req.ip / req.secure reflect the real client (needed for
  // rate limiting and Secure cookies) instead of the proxy itself.
  app.set("trust proxy", 1);

  // Security headers (X-Content-Type-Options, X-Frame-Options, HSTS, etc.) and
  // removes X-Powered-By. CORP is set to cross-origin because this API is
  // intentionally consumed from the web app's separate origin.
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.disable("x-powered-by");

  app.use(express.json());
  app.use(cookieParser());
  app.use(enforceOrigin);
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

  // Error handler must be registered last, after all routes.
  app.use(errorHandler);

  return app;
}
