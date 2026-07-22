import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createTestApp, type TestContext } from "./helpers.js";

// Own file so config.ts/app.ts load fresh with this comma-separated
// CLIENT_ORIGIN, rather than reusing another test file's single-origin config.

const ORIGIN_A = "https://coboard.example.com";
const ORIGIN_B = "http://localhost:3000";

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestApp({
    NODE_ENV: "production",
    CLIENT_ORIGIN: `${ORIGIN_A},${ORIGIN_B}`,
  });
});

afterAll(async () => {
  await ctx.stop();
});

describe("multiple allowed origins (comma-separated CLIENT_ORIGIN)", () => {
  it("echoes back each configured origin individually (never both at once)", async () => {
    const resA = await request(ctx.app).get("/health").set("Origin", ORIGIN_A);
    expect(resA.headers["access-control-allow-origin"]).toBe(ORIGIN_A);

    const resB = await request(ctx.app).get("/health").set("Origin", ORIGIN_B);
    expect(resB.headers["access-control-allow-origin"]).toBe(ORIGIN_B);
  });

  it("allows mutating requests from either configured origin", async () => {
    const resA = await request(ctx.app)
      .post("/auth/login")
      .set("Origin", ORIGIN_A)
      .send({ email: "a@b.com", password: "whatever-long" });
    expect(resA.status).not.toBe(403);

    const resB = await request(ctx.app)
      .post("/auth/login")
      .set("Origin", ORIGIN_B)
      .send({ email: "a@b.com", password: "whatever-long" });
    expect(resB.status).not.toBe(403);
  });

  it("still rejects an origin outside the list", async () => {
    const res = await request(ctx.app)
      .post("/auth/login")
      .set("Origin", "https://evil.example.com")
      .send({ email: "a@b.com", password: "whatever-long" });
    expect(res.status).toBe(403);

    const corsRes = await request(ctx.app).get("/health").set("Origin", "https://evil.example.com");
    expect(corsRes.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("treats the first configured origin as canonical for building links", async () => {
    const { CLIENT_ORIGIN } = await import("../src/config.js");
    expect(CLIENT_ORIGIN).toBe(ORIGIN_A);
  });
});
