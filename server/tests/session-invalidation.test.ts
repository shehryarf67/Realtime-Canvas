import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { createTestApp, getAuthCookie, type TestContext } from "./helpers.js";

// A separate file gives the reset rate limiters fresh counters.
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

function lastEmailedToken(): string {
  const calls = sendPasswordResetEmail.mock.calls;
  const url = calls[calls.length - 1]![1];
  return new URL(url).searchParams.get("token")!;
}

describe("password reset invalidates existing sessions (tokenVersion)", () => {
  const USER = { name: "Sessions", email: "sessions@example.com", password: "first-password" };

  it("rejects a session token issued before the reset, and issues a working one after", async () => {
    const signup = await request(ctx.app).post("/auth/signup").send(USER);
    const oldCookie = getAuthCookie(signup);

    // Start with a working old session.
    expect((await request(ctx.app).get("/auth/me").set("Cookie", oldCookie)).status).toBe(200);

    // Reset through the same token that would be emailed.
    await request(ctx.app).post("/auth/forgot-password").send({ email: USER.email });
    const reset = await request(ctx.app)
      .post("/auth/reset-password")
      .send({ token: lastEmailedToken(), password: "second-password" });
    expect(reset.status).toBe(200);

    // The old cookie must fail on public auth checks and protected routes.
    expect((await request(ctx.app).get("/auth/me").set("Cookie", oldCookie)).status).toBe(401);
    expect((await request(ctx.app).get("/boards").set("Cookie", oldCookie)).status).toBe(401);

    // The new password should create a working session.
    const relogin = await request(ctx.app)
      .post("/auth/login")
      .send({ email: USER.email, password: "second-password" });
    expect(relogin.status).toBe(200);
    const newCookie = getAuthCookie(relogin);
    expect((await request(ctx.app).get("/auth/me").set("Cookie", newCookie)).status).toBe(200);
  });
});
