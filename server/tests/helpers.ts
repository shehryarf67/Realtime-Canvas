import { MongoMemoryServer } from "mongodb-memory-server";
import type { Express } from "express";

// Config is read during import, so tests set env and start Mongo before loading
// the app modules dynamically.
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

// Keep only token=name from Set-Cookie so Supertest can replay the session.
export function getAuthCookie(res: { headers: Record<string, unknown> }): string {
  const setCookie = res.headers["set-cookie"];
  const cookies: string[] = Array.isArray(setCookie) ? setCookie : [String(setCookie ?? "")];
  const tokenCookie = cookies.find((c) => c.startsWith("token="));
  if (!tokenCookie) throw new Error("No token cookie in response");
  return tokenCookie.split(";")[0]!;
}
