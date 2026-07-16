import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createTestApp, getAuthCookie, type TestContext } from "./helpers.js";

// Counts against the limiters: signup allows 20/hour and login counts only
// FAILED attempts (10/15min) — this file stays well under both, so no test
// here ever trips a 429. Rate-limit behaviour itself is covered in
// rate-limit.test.ts, which runs in its own isolated module graph.

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestApp();
});

afterAll(async () => {
  await ctx.stop();
});

const USER = { name: "Ada Lovelace", email: "ada@example.com", password: "correct-horse" };

describe("POST /auth/signup", () => {
  it("creates a user, sets an httpOnly cookie, and returns the profile", async () => {
    const res = await request(ctx.app).post("/auth/signup").send(USER);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: USER.name, email: USER.email });
    expect(res.body.userId).toBeTruthy();
    // Never leak the hash
    expect(res.body.passwordHash).toBeUndefined();

    const cookie = res.headers["set-cookie"]![0]!;
    expect(cookie).toMatch(/^token=/);
    expect(cookie).toMatch(/HttpOnly/i);
    // Dev/test mode: Lax without Secure (prod flags covered in prod-cookies.test.ts)
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).not.toMatch(/Secure/i);
  });

  it("rejects a duplicate email with 409", async () => {
    const res = await request(ctx.app).post("/auth/signup").send(USER);
    expect(res.status).toBe(409);
  });

  it("rejects a missing name", async () => {
    const res = await request(ctx.app)
      .post("/auth/signup")
      .send({ email: "no-name@example.com", password: "long-enough" });
    expect(res.status).toBe(400);
  });

  it("rejects an invalid email", async () => {
    const res = await request(ctx.app)
      .post("/auth/signup")
      .send({ name: "X", email: "not-an-email", password: "long-enough" });
    expect(res.status).toBe(400);
  });

  it("rejects a password shorter than 8 characters", async () => {
    const res = await request(ctx.app)
      .post("/auth/signup")
      .send({ name: "X", email: "short@example.com", password: "1234567" });
    expect(res.status).toBe(400);
  });
});

describe("POST /auth/login", () => {
  it("logs in with correct credentials and sets the cookie", async () => {
    const res = await request(ctx.app)
      .post("/auth/login")
      .send({ email: USER.email, password: USER.password });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: USER.name, email: USER.email });
    expect(getAuthCookie(res)).toMatch(/^token=/);
  });

  it("rejects a wrong password with 401", async () => {
    const res = await request(ctx.app)
      .post("/auth/login")
      .send({ email: USER.email, password: "wrong-password" });
    expect(res.status).toBe(401);
  });

  it("rejects an unknown email with 401 and the same error as a wrong password", async () => {
    const wrongPassword = await request(ctx.app)
      .post("/auth/login")
      .send({ email: USER.email, password: "wrong-password" });
    const unknownEmail = await request(ctx.app)
      .post("/auth/login")
      .send({ email: "ghost@example.com", password: "whatever-long" });

    expect(unknownEmail.status).toBe(401);
    // Identical bodies, so the endpoint can't be used to probe which
    // emails have accounts.
    expect(unknownEmail.body).toEqual(wrongPassword.body);
  });
});

describe("GET /auth/me", () => {
  it("returns the profile when the cookie is present", async () => {
    const login = await request(ctx.app)
      .post("/auth/login")
      .send({ email: USER.email, password: USER.password });

    const res = await request(ctx.app).get("/auth/me").set("Cookie", getAuthCookie(login));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: USER.name, email: USER.email });
  });

  it("returns 401 without a cookie", async () => {
    const res = await request(ctx.app).get("/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns 401 for a garbage token", async () => {
    const res = await request(ctx.app).get("/auth/me").set("Cookie", "token=not-a-jwt");
    expect(res.status).toBe(401);
  });

  it("returns 401 for a token signed with a different secret", async () => {
    const jwt = await import("jsonwebtoken");
    const forged = jwt.default.sign({ userId: "x", name: "X", email: "x@x.com" }, "other-secret");
    const res = await request(ctx.app).get("/auth/me").set("Cookie", `token=${forged}`);
    expect(res.status).toBe(401);
  });
});

describe("POST /auth/logout", () => {
  it("clears the cookie", async () => {
    const res = await request(ctx.app).post("/auth/logout");
    expect(res.status).toBe(200);

    const cookie = res.headers["set-cookie"]![0]!;
    // An expired/emptied token cookie is how clearCookie manifests
    expect(cookie).toMatch(/^token=;/);
    expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970/i);
  });
});

describe("GET /health", () => {
  it("responds ok without auth", async () => {
    const res = await request(ctx.app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
