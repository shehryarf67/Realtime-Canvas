import { createServer } from "http";
import express from "express";
import cookieParser from "cookie-parser";
import { PORT, CLIENT_ORIGIN } from "./config.js";
import authRouter from "./routes/auth.js";
import boardsRouter from "./routes/boards.js";
import { connectToDatabase, closeDatabase } from "./db.js";
import { initSocketServer } from "./socket.js";

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

const httpServer = createServer(app);

initSocketServer(httpServer);

connectToDatabase()
  .then(() => {
    httpServer.listen(PORT, () => {
      console.log(`socket server listening on :${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err);
    process.exit(1);
  });

// Hosts send SIGTERM on redeploy/restart. Stop accepting new connections,
// let Mongo flush, then exit — otherwise in-flight canvas writes can be cut
// off mid-operation. The timeout guards against a hung close keeping the old
// instance alive past the platform's kill window.
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down");
  httpServer.close(async () => {
    await closeDatabase().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
});
