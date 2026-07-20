import { describe, it, expect } from "vitest";
import { sendPasswordResetEmail } from "../src/lib/mailer.js";

// Guards the fix for the "reset stays stuck on Sending…" bug: with no working
// SMTP the mailer must fall back to logging the link and return false quickly,
// never throwing or hanging (which would freeze the request).
describe("sendPasswordResetEmail without SMTP configured", () => {
  it("returns false without throwing", async () => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;

    const result = await sendPasswordResetEmail(
      "user@example.com",
      "http://localhost:3000/reset-password?token=abc123"
    );
    expect(result).toBe(false);
  });
});
