// Playwright gets the real API and sockets on an isolated port with temporary Mongo.
// Env must be ready before the dynamic imports because config.ts reads it on load.
import { createServer } from "http";
import { MongoMemoryServer } from "mongodb-memory-server";

const PORT = Number(process.env.E2E_SERVER_PORT) || 4100;
const CLIENT_ORIGIN = process.env.E2E_CLIENT_ORIGIN || "http://localhost:3100";

const mongo = await MongoMemoryServer.create();

process.env.MONGODB_URI = mongo.getUri();
process.env.JWT_SECRET = "e2e-test-secret";
process.env.CLIENT_ORIGIN = CLIENT_ORIGIN;
process.env.PORT = String(PORT);
// Development cookie flags are required for plain HTTP localhost.

const { buildApp } = await import("../src/app.js");
const { connectToDatabase, closeDatabase } = await import("../src/db.js");
const { initSocketServer } = await import("../src/socket.js");

await connectToDatabase();

const httpServer = createServer(buildApp());
initSocketServer(httpServer);

httpServer.listen(PORT, () => {
  console.log(`e2e backend listening on :${PORT} (client origin ${CLIENT_ORIGIN})`);
});

async function shutdown() {
  httpServer.close();
  await closeDatabase().catch(() => {});
  await mongo.stop().catch(() => {});
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
