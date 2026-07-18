import { createServer } from "http";
import { PORT } from "./config.js";
import { buildApp } from "./app.js";
import { connectToDatabase, closeDatabase } from "./db.js";
import { initSocketServer } from "./socket.js";
import { logger } from "./lib/logger.js";

const httpServer = createServer(buildApp());

initSocketServer(httpServer);

connectToDatabase()
  .then(() => {
    httpServer.listen(PORT, () => {
      logger.info("server listening", { port: PORT });
    });
  })
  .catch((err) => {
    logger.error("Failed to connect to MongoDB", { err });
    process.exit(1);
  });

// Hosts send SIGTERM on redeploy/restart. Stop accepting new connections,
// let Mongo flush, then exit — otherwise in-flight canvas writes can be cut
// off mid-operation. The timeout guards against a hung close keeping the old
// instance alive past the platform's kill window.
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down");
  httpServer.close(async () => {
    await closeDatabase().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
});
