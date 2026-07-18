import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { createTestApp, getAuthCookie, type TestContext } from "./helpers.js";

// Own file so the per-IP rate limiters (forgot/reset) start fresh and don't
// collide with the other auth tests.
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

    // The pre-reset session is valid right now.
    expect((await request(ctx.app).get("/auth/me").set("Cookie", oldCookie)).status).toBe(200);

    // Perform a real reset via the emailed token.
    await request(ctx.app).post("/auth/forgot-password").send({ email: USER.email });
    const reset = await request(ctx.app)
      .post("/auth/reset-password")
      .send({ token: lastEmailedToken(), password: "second-password" });
    expect(reset.status).toBe(200);

    // The old session is now dead on both a REST-guarded route and /me...
    expect((await request(ctx.app).get("/auth/me").set("Cookie", oldCookie)).status).toBe(401);
    expect((await request(ctx.app).get("/boards").set("Cookie", oldCookie)).status).toBe(401);

    // ...while a fresh login with the new password works.
    const relogin = await request(ctx.app)
      .post("/auth/login")
      .send({ email: USER.email, password: "second-password" });
    expect(relogin.status).toBe(200);
    const newCookie = getAuthCookie(relogin);
    expect((await request(ctx.app).get("/auth/me").set("Cookie", newCookie)).status).toBe(200);
  });
});
