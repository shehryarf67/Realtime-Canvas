import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { createTestApp, type TestContext } from "./helpers.js";

// Mock the mailer so forgot-password requests don't hit the network.
const { sendPasswordResetEmail } = vi.hoisted(() => ({
  sendPasswordResetEmail: vi.fn(async (_to: string, _resetUrl: string) => {}),
}));
vi.mock("../src/lib/mailer.js", () => ({ sendPasswordResetEmail }));

// This file gets a fresh module graph (and therefore zeroed limiter
// counters), and no other file's requests count against these buckets.

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestApp();
});

afterAll(async () => {
  await ctx.stop();
});

const USER = { name: "Rate Limit", email: "limits@example.com", password: "valid-password" };

describe("rate limiting", () => {
  it("locks out login after 10 failed attempts, even with the right password", async () => {
    await request(ctx.app).post("/auth/signup").send(USER);

    // A couple of successful logins first — these must NOT consume budget
    // (skipSuccessfulRequests), or a normal user could rate-limit themselves.
    for (let i = 0; i < 3; i++) {
      const ok = await request(ctx.app)
        .post("/auth/login")
        .send({ email: USER.email, password: USER.password });
      expect(ok.status).toBe(200);
    }

    // Burn the full failure budget
    for (let i = 0; i < 10; i++) {
      const fail = await request(ctx.app)
        .post("/auth/login")
        .send({ email: USER.email, password: "wrong-password" });
      expect(fail.status).toBe(401);
    }

    // 11th attempt is refused before the handler runs — correct password or not
    const blocked = await request(ctx.app)
      .post("/auth/login")
      .send({ email: USER.email, password: USER.password });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/too many/i);
  });

  it("limits forgot-password to 5 requests per window", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await request(ctx.app)
        .post("/auth/forgot-password")
        .send({ email: USER.email });
      expect(res.status).toBe(200);
    }

    const blocked = await request(ctx.app)
      .post("/auth/forgot-password")
      .send({ email: USER.email });
    expect(blocked.status).toBe(429);
  });

  it("limits signup to 20 accounts per window", async () => {
    // One signup already used by this file's setup
    for (let i = 0; i < 19; i++) {
      const res = await request(ctx.app)
        .post("/auth/signup")
        .send({ name: `U${i}`, email: `user${i}@example.com`, password: "valid-password" });
      expect(res.status).toBe(201);
    }

    const blocked = await request(ctx.app)
      .post("/auth/signup")
      .send({ name: "One Too Many", email: "u21@example.com", password: "valid-password" });
    expect(blocked.status).toBe(429);
  });
});
