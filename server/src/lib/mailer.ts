import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "./logger.js";

// Real SMTP is used when configured. Otherwise I use Ethereal and log a preview
// link, which keeps local password-reset testing simple.
const MAIL_FROM = process.env.MAIL_FROM || '"coboard" <no-reply@coboard.local>';

let transporterPromise: Promise<{ transporter: Transporter; isEthereal: boolean }> | null = null;

function getTransporter() {
  if (!transporterPromise) {
    transporterPromise = (async () => {
      const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

      if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
        return {
          transporter: nodemailer.createTransport({
            host: SMTP_HOST,
            port: Number(SMTP_PORT) || 587,
            secure: Number(SMTP_PORT) === 465,
            auth: { user: SMTP_USER, pass: SMTP_PASS },
          }),
          isEthereal: false,
        };
      }

      const testAccount = await nodemailer.createTestAccount();
      logger.info("mailer: no SMTP config found, using Ethereal test account", { user: testAccount.user });
      return {
        transporter: nodemailer.createTransport({
          host: "smtp.ethereal.email",
          port: 587,
          secure: false,
          auth: { user: testAccount.user, pass: testAccount.pass },
        }),
        isEthereal: true,
      };
    })();
  }
  return transporterPromise;
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const { transporter, isEthereal } = await getTransporter();

  const info = await transporter.sendMail({
    from: MAIL_FROM,
    to,
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
  });

  if (isEthereal) {
    logger.info("mailer: password reset email preview", { previewUrl: nodemailer.getTestMessageUrl(info) });
  }
}
