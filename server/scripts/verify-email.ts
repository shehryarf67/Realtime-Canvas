// Send a test message through the same path used by password resets.
//
//   npm run verify-email -- you@example.com
//
// Run with the server env so Brevo and sender settings are available.
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

// exitCode lets fetch close its handles cleanly before Node exits on Windows.
