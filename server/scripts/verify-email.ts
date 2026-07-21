// Sends a real password-reset-style email through the configured provider so
// you can confirm delivery works before relying on it. Uses the exact same
// code path the app uses.
//
//   npm run verify-email -- you@example.com
//
// Run it with the same env the server uses (needs BREVO_API_KEY + MAIL_FROM).
import "dotenv/config";
import { sendPasswordResetEmail } from "../src/lib/mailer.js";

const to = process.argv[2];
if (!to) {
  console.log("Usage: npm run verify-email -- you@example.com");
  process.exitCode = 1;
} else {
  const ok = await sendPasswordResetEmail(to, "https://example.com/reset-password?token=verify-test");
  if (ok) {
    console.log(`OK: provider accepted a test reset email to ${to}. Check the inbox (and spam).`);
  } else {
    console.log("FAILED: not sent. Set BREVO_API_KEY and verify your sender address; see the logged error above.");
    process.exitCode = 1;
  }
}

// Setting exitCode (not calling process.exit()) lets Node close fetch's
// underlying network handles on its own — forcing exit while they're still
// closing triggers a libuv assertion crash on Windows.
