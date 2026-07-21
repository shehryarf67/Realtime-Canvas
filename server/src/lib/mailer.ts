import { logger } from "./logger.js";

// Sends password-reset email via Brevo's HTTP API (over HTTPS/443) rather than
// SMTP. Hosts like Render block outbound SMTP ports (25/465/587), which makes
// SMTP unreliable in production; an HTTPS API is not port-blocked.
//
// Set BREVO_API_KEY to enable real delivery. Without it (or on any failure) the
// reset link is logged instead of thrown, so the request never hangs or 500s
// and the flow stays testable in local dev (the link is also surfaced on the
// page in non-production).
const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const RAW_MAIL_FROM = process.env.MAIL_FROM || "coboard <no-reply@coboard.local>";
const SEND_TIMEOUT_MS = 15_000;

// Optional: a real address you actually read, shown as Reply-To. This is a
// normal, non-deceptive pattern (From: automated sender, Reply-To: a human
// inbox) — unlike making the FROM address itself claim to be @gmail.com,
// which Brevo cannot authenticate and which reads as spoofing to providers
// that enforce DMARC on gmail.com (this is what silently dropped the earlier
// test sends). MAIL_FROM should be Brevo's own verified sender/domain, not a
// gmail.com address.
const REPLY_TO = process.env.MAIL_REPLY_TO;

// Parse `Name <email@host>` (or a bare address) into Brevo's sender shape.
function parseSender(raw: string): { name: string; email: string } {
  const match = raw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match && match[2]) {
    return { name: match[1]?.trim() || "coboard", email: match[2].trim() };
  }
  return { name: "coboard", email: raw.trim() };
}

function renderEmail(resetUrl: string) {
  return {
    subject: "Reset your coboard password",
    textContent: `You requested a password reset for your coboard account.\n\nOpen this link to choose a new password (valid for 3 hours):\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.`,
    htmlContent: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #171717;">
        <h2 style="font-weight: 500;">Reset your password</h2>
        <p style="color: #525252; line-height: 1.6;">
          You requested a password reset for your coboard account.
          Click the button below to choose a new password. The link is valid for 3 hours.
        </p>
        <a href="${resetUrl}"
           style="display: inline-block; background: #171717; color: #ffffff; padding: 12px 24px; text-decoration: none; font-weight: 500; margin: 16px 0;">
          Reset password
        </a>
        <p style="color: #a3a3a3; font-size: 13px; line-height: 1.6;">
          If the button doesn't work, paste this link into your browser:<br />
          <a href="${resetUrl}" style="color: #525252;">${resetUrl}</a>
        </p>
        <p style="color: #a3a3a3; font-size: 13px;">
          If you didn't request this, you can safely ignore this email.
        </p>
      </div>
    `,
  };
}

// Returns true if the email was accepted by the provider, false when it fell
// back to logging (no API key, or the send failed). Never throws.
export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<boolean> {
  const apiKey = process.env.BREVO_API_KEY;

  if (apiKey) {
    try {
      const res = await fetch(BREVO_ENDPOINT, {
        method: "POST",
        headers: {
          "api-key": apiKey,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          sender: parseSender(RAW_MAIL_FROM),
          to: [{ email: to }],
          ...(REPLY_TO ? { replyTo: { email: REPLY_TO } } : {}),
          ...renderEmail(resetUrl),
        }),
        // fetch has no default timeout — cap it so a slow/hung API call can't
        // freeze the reset request.
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });

      if (res.ok) return true;

      const detail = await res.text().catch(() => "");
      logger.error("Email provider rejected the reset email", {
        status: res.status,
        detail: detail.slice(0, 300),
      });
    } catch (err) {
      logger.error("Failed to send password reset email via provider API", { err });
    }
  }

  // No API key, or the send failed — log the link so the reset stays usable.
  logger.warn("Password reset email not delivered; logging the link instead", { to, resetUrl });
  return false;
}
