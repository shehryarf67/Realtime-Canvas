import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { createTestApp, type TestContext } from "./helpers.js";

// Capture reset links without touching SMTP. vi.hoisted matches mock hoisting.
const { sendPasswordResetEmail } = vi.hoisted(() => ({
  sendPasswordResetEmail: vi.fn(async (_to: string, _resetUrl: string) => {}),
}));
vi.mock("../src/lib/mailer.js", () => ({ sendPasswordResetEmail }));

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestApp();
});

afterAll(async () => {
  await ctx.stop();
});

const USER = { name: "Grace Hopper", email: "grace@example.com", password: "original-pass" };

function lastEmailedToken(): string {
  const calls = sendPasswordResetEmail.mock.calls;
  const resetUrl = calls[calls.length - 1]![1];
  const token = new URL(resetUrl).searchParams.get("token");
  expect(token).toBeTruthy();
  return token!;
}

describe("password reset flow", () => {
  it("emails a reset link for an existing account", async () => {
    await request(ctx.app).post("/auth/signup").send(USER);

    const res = await request(ctx.app).post("/auth/forgot-password").send({ email: USER.email });
    expect(res.status).toBe(200);
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(sendPasswordResetEmail.mock.calls[0]![0]).toBe(USER.email);
  });

  it("responds 200 for an unknown email without sending anything (no account enumeration)", async () => {
    const before = sendPasswordResetEmail.mock.calls.length;
    const res = await request(ctx.app).post("/auth/forgot-password").send({ email: "nobody@example.com" });
    expect(res.status).toBe(200);
    expect(sendPasswordResetEmail.mock.calls.length).toBe(before);
  });

  it("accepts the emailed token, changes the password, and invalidates the old one", async () => {
    const token = lastEmailedToken();

    const reset = await request(ctx.app)
      .post("/auth/reset-password")
      .send({ token, password: "brand-new-pass" });
    expect(reset.status).toBe(200);

    const oldLogin = await request(ctx.app)
      .post("/auth/login")
      .send({ email: USER.email, password: USER.password });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(ctx.app)
      .post("/auth/login")
      .send({ email: USER.email, password: "brand-new-pass" });
    expect(newLogin.status).toBe(200);
  });

  it("rejects reusing a consumed token", async () => {
    const token = lastEmailedToken();
    const res = await request(ctx.app)
      .post("/auth/reset-password")
      .send({ token, password: "another-new-pass" });
    expect(res.status).toBe(400);
  });

  it("rejects an expired token", async () => {
    await request(ctx.app).post("/auth/forgot-password").send({ email: USER.email });
    const token = lastEmailedToken();

    // Expire the token directly instead of waiting an hour.
    const { users } = await import("../src/db.js");
    await users().updateOne({ email: USER.email }, { $set: { resetTokenExpiresAt: Date.now() - 1000 } });

    const res = await request(ctx.app)
      .post("/auth/reset-password")
      .send({ token, password: "should-not-work" });
    expect(res.status).toBe(400);
  });

  it("rejects a made-up token", async () => {
    const res = await request(ctx.app)
      .post("/auth/reset-password")
      .send({ token: "f".repeat(64), password: "whatever-long" });
    expect(res.status).toBe(400);
  });

  it("rejects a too-short new password without consuming the token", async () => {
    await request(ctx.app).post("/auth/forgot-password").send({ email: USER.email });
    const token = lastEmailedToken();

    const short = await request(ctx.app).post("/auth/reset-password").send({ token, password: "short" });
    expect(short.status).toBe(400);

    // A rejected short password must not consume the token.
    const ok = await request(ctx.app).post("/auth/reset-password").send({ token, password: "long-enough-pass" });
    expect(ok.status).toBe(200);
  });
});
