import { MongoMemoryServer } from "mongodb-memory-server";
import type { Express } from "express";

// Everything the app needs must be in process.env BEFORE src modules load,
// because config.ts reads (and validates) env at import time. That's why the
// app is imported dynamically here, after the in-memory Mongo is up — a
// static `import { buildApp } from "../src/app.js"` at the top of a test
// file would evaluate config.ts before any env was set and exit the process.
export type TestContext = {
  app: Express;
  mongo: MongoMemoryServer;
  stop: () => Promise<void>;
};

export async function createTestApp(env: Record<string, string> = {}): Promise<TestContext> {
  const mongo = await MongoMemoryServer.create();

  process.env.MONGODB_URI = mongo.getUri();
  process.env.JWT_SECRET = "test-jwt-secret";
  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value;
  }

  const { buildApp } = await import("../src/app.js");
  const { connectToDatabase, closeDatabase } = await import("../src/db.js");

  await connectToDatabase();

  return {
    app: buildApp(),
    mongo,
    stop: async () => {
      await closeDatabase();
      await mongo.stop();
    },
  };
}

// Pull the auth cookie ("token=...") out of a supertest response so it can be
// replayed on subsequent requests, the way a browser would.
export function getAuthCookie(res: { headers: Record<string, unknown> }): string {
  const setCookie = res.headers["set-cookie"];
  const cookies: string[] = Array.isArray(setCookie) ? setCookie : [String(setCookie ?? "")];
  const tokenCookie = cookies.find((c) => c.startsWith("token="));
  if (!tokenCookie) throw new Error("No token cookie in response");
  return tokenCookie.split(";")[0]!;
}
