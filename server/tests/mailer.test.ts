import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendPasswordResetEmail } from "../src/lib/mailer.js";

// Guards the fix for the "reset stays stuck on Sending…" bug: with no email
// provider configured, the mailer must fall back to logging the link and return
// false quickly — never throwing or hanging (which would freeze the request).
describe("sendPasswordResetEmail without a provider configured", () => {
  it("returns false without throwing", async () => {
    delete process.env.BREVO_API_KEY;

    const result = await sendPasswordResetEmail(
      "user@example.com",
      "http://localhost:3000/reset-password?token=abc123"
    );
    expect(result).toBe(false);
  });
});

// Guards the fix for the silently-dropped emails: MAIL_FROM must never be
// forced to look like it's a gmail.com address (Brevo can't authenticate that,
// and providers enforcing DMARC drop it) — sender/replyTo are read from env
// and sent to Brevo as-is, whatever the operator configures.
describe("sendPasswordResetEmail request payload", () => {
  const ORIGINAL_ENV = { ...process.env };
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  it("parses 'Name <email>' MAIL_FROM and includes replyTo when MAIL_REPLY_TO is set", async () => {
    process.env.BREVO_API_KEY = "test-key";
    process.env.MAIL_FROM = "coboard <noreply@example-brevo-domain.com>";
    process.env.MAIL_REPLY_TO = "real-inbox@gmail.com";
    vi.resetModules();
    const { sendPasswordResetEmail: send } = await import("../src/lib/mailer.js");

    const ok = await send("user@example.com", "https://example.com/reset?token=x");
    expect(ok).toBe(true);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.sender).toEqual({ name: "coboard", email: "noreply@example-brevo-domain.com" });
    expect(body.replyTo).toEqual({ email: "real-inbox@gmail.com" });
    expect(body.to).toEqual([{ email: "user@example.com" }]);
  });

  it("omits replyTo entirely when MAIL_REPLY_TO is not set", async () => {
    process.env.BREVO_API_KEY = "test-key";
    process.env.MAIL_FROM = "coboard <noreply@example-brevo-domain.com>";
    delete process.env.MAIL_REPLY_TO;
    vi.resetModules();
    const { sendPasswordResetEmail: send } = await import("../src/lib/mailer.js");

    await send("user@example.com", "https://example.com/reset?token=x");

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.replyTo).toBeUndefined();
  });
});
