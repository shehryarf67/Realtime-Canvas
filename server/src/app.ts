import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { ALLOWED_ORIGINS } from "./config.js";
import authRouter from "./routes/auth.js";
import boardsRouter from "./routes/boards.js";
import { logger } from "./lib/logger.js";

// The production cookie is cross-site, so I check the Origin on every write.
// Requests without an Origin are kept for scripts and health checks.
const MUTATING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const enforceOrigin: RequestHandler = (req, res, next) => {
  if (!MUTATING_METHODS.has(req.method)) return next();
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    res.status(403).json({ error: "Cross-origin request blocked" });
    return;
  }
  next();
};

// I log the real error here but never send stack traces or internals to clients.
const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  logger.error("Unhandled request error", { err });
  // Express has to finish handling it if headers were already sent.
  if (res.headersSent) {
    return next(err);
  }
  // Keep known 4xx errors useful. Everything else gets a safe generic message.
  const status = (err as { status?: number; statusCode?: number })?.status
    ?? (err as { statusCode?: number })?.statusCode;
  if (typeof status === "number" && status >= 400 && status < 500) {
    res.status(status).json({ error: (err as Error).message || "Bad request" });
    return;
  }
  res.status(500).json({ error: "Something went wrong" });
};

// This only builds Express. index.ts adds HTTP, sockets and Mongo, while tests
// can mount this function directly.
export function buildApp(): express.Express {
  const app = express();

  // There is one hosting proxy in front of the API. This keeps client IPs and
  // secure-cookie checks accurate.
  app.set("trust proxy", 1);

  // Helmet adds the standard security headers. CORP stays cross-origin because
  // the web app and API are deployed on separate domains.
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.disable("x-powered-by");

  app.use(express.json());
  app.use(cookieParser());
  app.use(enforceOrigin);
  app.use((req, res, next) => {
    // CORS accepts one response origin, so echo the caller after allowlist checks.
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    // This stops a cache from reusing CORS headers for another origin.
    res.setHeader("Vary", "Origin");
    // CORS preflights can finish before the request reaches a route.
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // The host uses this to check whether the API is alive.
  app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.use("/auth", authRouter);
  app.use("/boards", boardsRouter);

  // Express error handlers have to come after the routes they cover.
  app.use(errorHandler);

  return app;
}
