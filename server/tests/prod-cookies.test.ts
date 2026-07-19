import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createTestApp, type TestContext } from "./helpers.js";

// Load the app in production mode so cross-site cookie flags are really tested.

const ORIGIN = "https://coboard.example.com";

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestApp({ NODE_ENV: "production", CLIENT_ORIGIN: ORIGIN });
});

afterAll(async () => {
  await ctx.stop();
});

const USER = { name: "Prod User", email: "prod@example.com", password: "valid-password" };

describe("production cookie flags", () => {
  it("issues the auth cookie with Secure, HttpOnly and SameSite=None", async () => {
    const res = await request(ctx.app).post("/auth/signup").send(USER);
    expect(res.status).toBe(201);

    const cookie = res.headers["set-cookie"]![0]!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=None/i);
  });

  it("clears the cookie with the same flags (browsers treat mismatched flags as a different cookie)", async () => {
    const res = await request(ctx.app).post("/auth/logout");
    const cookie = res.headers["set-cookie"]![0]!;
    expect(cookie).toMatch(/^token=;/);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=None/i);
  });
});

describe("CORS", () => {
  it("answers preflight with 204 and the configured origin", async () => {
    const res = await request(ctx.app)
      .options("/auth/login")
      .set("Origin", ORIGIN)
      .set("Access-Control-Request-Method", "POST");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(ORIGIN);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
    expect(res.headers["access-control-allow-methods"]).toContain("PATCH");
    expect(res.headers["access-control-allow-methods"]).toContain("DELETE");
  });

  it("marks responses as varying by Origin for caches", async () => {
    const res = await request(ctx.app).get("/health");
    expect(res.headers["vary"]).toContain("Origin");
  });
});

describe("security headers", () => {
  it("sets hardening headers and hides the framework", async () => {
    const res = await request(ctx.app).get("/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBeDefined();
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});

describe("CSRF origin enforcement", () => {
  it("blocks a mutating request from a foreign origin with 403", async () => {
    const res = await request(ctx.app)
      .post("/auth/login")
      .set("Origin", "https://evil.example.com")
      .send({ email: "a@b.com", password: "whatever-long" });
    expect(res.status).toBe(403);
  });

  it("allows a mutating request from the configured origin (not blocked by 403)", async () => {
    const res = await request(ctx.app)
      .post("/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: "a@b.com", password: "whatever-long" });
    // A matching origin should reach login instead of the origin guard.
    expect(res.status).not.toBe(403);
  });

  it("allows a request with no Origin header (server-to-server / tools)", async () => {
    const res = await request(ctx.app)
      .post("/auth/login")
      .send({ email: "a@b.com", password: "whatever-long" });
    expect(res.status).not.toBe(403);
  });
});
