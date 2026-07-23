import { logger } from "./logger.js";

// Brevo uses HTTPS because the production host blocks normal SMTP ports.
// Missing config or send failures fall back to logging the reset link.
const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const RAW_MAIL_FROM = process.env.MAIL_FROM || "coboard <no-reply@coboard.local>";
const SEND_TIMEOUT_MS = 15_000;

// MAIL_FROM must be a verified Brevo sender. A personal inbox belongs in
// MAIL_REPLY_TO because using it as From can fail DMARC checks.
const REPLY_TO = process.env.MAIL_REPLY_TO;

// Accept either "Name <email@host>" or a bare sender address.
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

// Return false after the safe logging fallback instead of throwing.
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
        // Keep a slow provider from holding the reset request open forever.
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

  // Keep local resets usable when delivery is not available.
  logger.warn("Password reset email not delivered; logging the link instead", { to, resetUrl });
  return false;
}
