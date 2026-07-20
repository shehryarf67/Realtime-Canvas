// Verifies the SMTP configuration in the environment, so you can confirm
// password-reset email will actually send before relying on it.
//
//   npm run verify-smtp                      # just check connection + auth
//   npm run verify-smtp -- you@example.com   # also send a real test email
//
// In production, run it with the same env the server uses.
import "dotenv/config";
import nodemailer from "nodemailer";

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM } = process.env;

if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
  console.log("SMTP not fully configured (need SMTP_HOST, SMTP_USER, SMTP_PASS).");
  console.log("Reset emails will be logged instead of sent.");
  process.exit(1);
}

const port = Number(SMTP_PORT) || 587;
const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port,
  secure: port === 465,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 15_000,
});

try {
  await transporter.verify();
  console.log(`OK: connected + authenticated to ${SMTP_HOST}:${port} as ${SMTP_USER}`);

  const to = process.argv[2];
  if (to) {
    const info = await transporter.sendMail({
      from: MAIL_FROM || SMTP_USER,
      to,
      subject: "coboard SMTP test",
      text: "If you can read this, your SMTP configuration works.",
    });
    console.log(`Sent test email to ${to} (messageId: ${info.messageId})`);
  } else {
    console.log("Tip: pass an address to also send a test — npm run verify-smtp -- you@example.com");
  }
  process.exit(0);
} catch (e) {
  const err = e as { code?: string; message?: string };
  console.log(`FAILED: ${err.code ?? ""} ${err.message ?? e}`);
  process.exit(1);
}
