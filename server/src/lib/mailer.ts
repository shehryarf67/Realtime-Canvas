import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "./logger.js";

// Sends over real SMTP when it's configured. When it isn't (or a send fails),
// it logs the reset link instead of throwing — so the password-reset request
// can never hang or 500, and the flow stays testable in local dev.
const MAIL_FROM = process.env.MAIL_FROM || '"coboard" <no-reply@coboard.local>';

function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

let transporter: Transporter | null = null;
function getTransporter(): Transporter {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT) || 587;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      // Without these, an unreachable/misconfigured SMTP host makes sendMail
      // hang indefinitely, which freezes the whole request. Fail in seconds.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }
  return transporter;
}

function renderEmail(resetUrl: string) {
  return {
    subject: "Reset your coboard password",
    text: `You requested a password reset for your coboard account.\n\nOpen this link to choose a new password (valid for 1 hour):\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #171717;">
        <h2 style="font-weight: 500;">Reset your password</h2>
        <p style="color: #525252; line-height: 1.6;">
          You requested a password reset for your coboard account.
          Click the button below to choose a new password. The link is valid for 1 hour.
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

// Returns true when the email was handed to an SMTP server, false when it fell
// back to logging (no SMTP configured, or the send failed). Never throws, so
// callers can't hang or leak send-failures to the client.
export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<boolean> {
  if (smtpConfigured()) {
    try {
      await getTransporter().sendMail({ from: MAIL_FROM, to, ...renderEmail(resetUrl) });
      return true;
    } catch (err) {
      logger.error("Failed to send password reset email via SMTP", { err });
      // fall through to logging the link
    }
  }

  // No working email transport — log the link so the reset is still usable.
  logger.warn("Password reset email not delivered; logging the link instead", { to, resetUrl });
  return false;
}
