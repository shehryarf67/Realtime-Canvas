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

// I close HTTP and Mongo cleanly on deploys so active canvas writes can finish.
// The timeout is the fallback if shutdown gets stuck.
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down");
  httpServer.close(async () => {
    await closeDatabase().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
});
