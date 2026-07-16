import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { users } from "../db.js";
import { JWT_SECRET, CLIENT_ORIGIN, AUTH_COOKIE_NAME, AUTH_COOKIE_OPTIONS } from "../config.js";
import { isValidEmail, isValidPassword, isNonEmptyString, MIN_PASSWORD_LENGTH } from "../lib/validation.js";
import { sendPasswordResetEmail } from "../lib/mailer.js";

const router = Router();

const SALT_ROUNDS = 10;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const AUTH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Per-IP limits on the credential endpoints. Without these, login is free to
// brute-force and forgot-password can be used to bomb someone's inbox.
// /me and /logout stay unlimited — they're harmless and called on every page.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  // Only failed attempts count toward the limit, so a user who logs in and
  // out repeatedly (or a shared office IP) isn't locked out by successes.
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again in a few minutes." },
});

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many accounts created from this address. Try again later." },
});

// Separate instances (not one shared limiter): forgot-password and
// reset-password would otherwise drain a single per-IP bucket together,
// and a user who requested two emails couldn't complete a legitimate reset.
const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5, // each one sends an email — the abusable part, so strictest
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many password reset requests. Try again later." },
});

const resetPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10, // tokens are 256-bit — this guards volume, not brute force
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again later." },
});

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

router.post("/signup", signupLimiter, async (req, res) => {
  const { name, email, password } = req.body;

  if (!isNonEmptyString(name)) {
    res.status(400).json({ error: "Name is required" });
    return;
  }
  if (!isValidEmail(email)) {
    res.status(400).json({ error: "Enter a valid email address" });
    return;
  }
  if (!isValidPassword(password)) {
    res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    return;
  }

  // Check if user already exists
  const existing = await users().findOne({ email });
  if (existing) {
    res.status(409).json({ error: "Email already in use" });
    return;
  }

  // Hash the password before storing it
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  // Insert the new user
  const result = await users().insertOne({
    name,
    email,
    passwordHash,
    createdAt: Date.now(),
  });

  // Sign a JWT with the new user's ID, name, and email
  const token = jwt.sign(
    { userId: result.insertedId, name, email },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  // Send the token as an HTTP-only cookie so JS can't read it. Flags come
  // from config: Secure + SameSite=None in production (cross-site), Lax in dev.
  res.cookie(AUTH_COOKIE_NAME, token, {
    ...AUTH_COOKIE_OPTIONS,
    maxAge: AUTH_COOKIE_MAX_AGE_MS,
  });

  res.status(201).json({ userId: result.insertedId, name, email });
});

router.post("/login", loginLimiter, async (req, res) => {
  const { email, password } = req.body;

  // Find the user by email
  const user = await users().findOne({ email });
  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  // Compare the provided password against the stored hash
  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  // Sign a JWT the same way signup does
  const token = jwt.sign(
    { userId: user._id, name: user.name, email: user.email },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.cookie(AUTH_COOKIE_NAME, token, {
    ...AUTH_COOKIE_OPTIONS,
    maxAge: AUTH_COOKIE_MAX_AGE_MS,
  });

  res.status(200).json({ userId: user._id, name: user.name, email: user.email });
});

router.get("/me", (req, res) => {
  const token = req.cookies?.token;
  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; name: string; email: string };
    res.status(200).json({ userId: decoded.userId, name: decoded.name, email: decoded.email });
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
});

router.post("/logout", (_req, res) => {
  // clearCookie must send the same flags the cookie was set with — a
  // Secure/SameSite=None cookie is a different cookie from the browser's
  // point of view, and clearing without the flags silently does nothing
  // in production.
  res.clearCookie(AUTH_COOKIE_NAME, AUTH_COOKIE_OPTIONS);
  res.status(200).json({ ok: true });
});

router.post("/forgot-password", forgotPasswordLimiter, async (req, res) => {
  const { email } = req.body;
  if (!isValidEmail(email)) {
    res.status(400).json({ error: "Enter a valid email address" });
    return;
  }

  const user = await users().findOne({ email });
  if (!user) {
    // Same response whether or not the account exists, so this endpoint
    // can't be used to discover which emails are registered.
    res.status(200).json({ ok: true });
    return;
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  await users().updateOne(
    { _id: user._id },
    {
      $set: {
        resetTokenHash: hashToken(rawToken),
        resetTokenExpiresAt: Date.now() + RESET_TOKEN_TTL_MS,
      },
    }
  );

  const resetUrl = `${CLIENT_ORIGIN}/reset-password?token=${rawToken}`;
  try {
    await sendPasswordResetEmail(user.email, resetUrl);
  } catch (err) {
    console.error("Failed to send password reset email:", err);
    res.status(500).json({ error: "Could not send the reset email. Try again later." });
    return;
  }

  res.status(200).json({ ok: true });
});

router.post("/reset-password", resetPasswordLimiter, async (req, res) => {
  const { token, password } = req.body;
  if (!isNonEmptyString(token)) {
    res.status(400).json({ error: "Reset token is required" });
    return;
  }
  if (!isValidPassword(password)) {
    res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    return;
  }

  const user = await users().findOne({
    resetTokenHash: hashToken(token),
    resetTokenExpiresAt: { $gt: Date.now() },
  });
  if (!user) {
    res.status(400).json({ error: "This reset link is invalid or has expired" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  await users().updateOne(
    { _id: user._id },
    {
      $set: { passwordHash },
      $unset: { resetTokenHash: "", resetTokenExpiresAt: "" },
    }
  );

  res.status(200).json({ ok: true });
});

export default router;
