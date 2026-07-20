import { Router, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { boards, items, users } from "../db.js";
import { JWT_SECRET, CLIENT_ORIGIN, AUTH_COOKIE_NAME, AUTH_COOKIE_OPTIONS, IS_PROD } from "../config.js";
import { isValidEmail, isValidPassword, isNonEmptyString, normalizeEmail, MIN_PASSWORD_LENGTH } from "../lib/validation.js";
import { sendPasswordResetEmail } from "../lib/mailer.js";
import { verifyToken } from "../lib/auth.js";
import requireAuth from "../middleware/requireAuth.js";
import { disconnectUserSockets, notifyBoardDeleted } from "../socket.js";

const router = Router();

const SALT_ROUNDS = 10;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const AUTH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_DISPLAY_NAME_LENGTH = 80;

// I rate limit credential routes to slow password guessing and email spam.
// /me and /logout stay open because the app calls them often.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  // Successful logins should not use up the shared IP limit.
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

// These need separate buckets or requesting an email could block using it.
const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5, // Email sending gets the strictest limit.
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many password reset requests. Try again later." },
});

const resetPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10, // The token is strong; this limit mainly controls request volume.
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again later." },
});

// A stolen session should not get unlimited guesses at the current password.
const changePasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId ?? "anonymous",
  message: { error: "Too many attempts. Try again in a few minutes." },
});

const deleteAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId ?? "anonymous",
  message: { error: "Too many attempts. Try again in a few minutes." },
});

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function setAuthCookie(
  res: Response,
  user: { _id: unknown; name: string; email: string; tokenVersion?: number }
): void {
  const token = jwt.sign(
    {
      userId: String(user._id),
      name: user.name,
      email: user.email,
      tokenVersion: user.tokenVersion ?? 0,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
  res.cookie(AUTH_COOKIE_NAME, token, {
    ...AUTH_COOKIE_OPTIONS,
    maxAge: AUTH_COOKIE_MAX_AGE_MS,
  });
}

router.post("/signup", signupLimiter, async (req, res) => {
  const { name, password } = req.body;
  const email = normalizeEmail(req.body.email);

  if (!isNonEmptyString(name) || name.trim().length > MAX_DISPLAY_NAME_LENGTH) {
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

  const existing = await users().findOne({ email });
  if (existing) {
    res.status(409).json({ error: "Email already in use" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const trimmedName = name.trim();
  const result = await users().insertOne({
    name: trimmedName,
    email,
    passwordHash,
    createdAt: Date.now(),
    tokenVersion: 0,
  });

  // The cookie is HTTP-only, with production and local flags set in config.ts.
  setAuthCookie(res, { _id: result.insertedId, name: trimmedName, email, tokenVersion: 0 });

  res.status(201).json({ userId: result.insertedId, name: trimmedName, email });
});

router.post("/login", loginLimiter, async (req, res) => {
  const { password } = req.body;
  const email = normalizeEmail(req.body.email);

  // Type checks stop Mongo operators from being passed as email or password.
  // The generic reply also avoids exposing which accounts exist.
  if (!isValidEmail(email) || !isNonEmptyString(password)) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const user = await users().findOne({ email });
  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  // tokenVersion lets a later password change cancel this cookie.
  setAuthCookie(res, user);

  res.status(200).json({ userId: user._id, name: user.name, email: user.email });
});

router.get("/me", async (req, res) => {
  const token = req.cookies?.token;
  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  // /me uses the full version check instead of only trusting the JWT signature.
  const decoded = await verifyToken(token);
  if (!decoded) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  res.status(200).json({ userId: decoded.userId, name: decoded.name, email: decoded.email });
});

router.post("/logout", (_req, res) => {
  // Clearing needs the same flags used when the cookie was created.
  res.clearCookie(AUTH_COOKIE_NAME, AUTH_COOKIE_OPTIONS);
  res.status(200).json({ ok: true });
});

router.patch("/profile", requireAuth, async (req, res) => {
  const { name } = req.body;
  if (!isNonEmptyString(name) || name.trim().length > MAX_DISPLAY_NAME_LENGTH) {
    res.status(400).json({ error: `Display name must be between 1 and ${MAX_DISPLAY_NAME_LENGTH} characters` });
    return;
  }
  if (!req.userEmail) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const user = await users().findOneAndUpdate(
    { email: req.userEmail },
    { $set: { name: name.trim() } },
    { returnDocument: "after" }
  );
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Refresh the cookie so new socket connections get the changed name.
  setAuthCookie(res, user);
  res.status(200).json({ userId: user._id, name: user.name, email: user.email });
});

router.post("/change-password", requireAuth, changePasswordLimiter, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!isNonEmptyString(currentPassword)) {
    res.status(400).json({ error: "Current password is required" });
    return;
  }
  if (!isValidPassword(newPassword)) {
    res.status(400).json({ error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    return;
  }
  if (!req.userEmail) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const user = await users().findOne({ email: req.userEmail });
  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }
  if (await bcrypt.compare(newPassword, user.passwordHash)) {
    res.status(400).json({ error: "New password must be different from your current password" });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  const updatedUser = await users().findOneAndUpdate(
    { _id: user._id },
    {
      $set: { passwordHash },
      $unset: { resetTokenHash: "", resetTokenExpiresAt: "" },
      $inc: { tokenVersion: 1 },
    },
    { returnDocument: "after" }
  );
  if (!updatedUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Old cookies are now invalid. This browser gets the only fresh one.
  setAuthCookie(res, updatedUser);
  disconnectUserSockets(String(updatedUser._id));
  res.status(200).json({ ok: true });
});

router.delete("/account", requireAuth, deleteAccountLimiter, async (req, res) => {
  const { password, confirmation } = req.body;
  if (!isNonEmptyString(password) || confirmation !== "DELETE") {
    res.status(400).json({ error: "Enter your password and type DELETE to confirm" });
    return;
  }
  if (!req.userEmail) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const user = await users().findOne({ email: req.userEmail });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ error: "Password is incorrect" });
    return;
  }

  const userId = String(user._id);
  const ownedBoards = await boards().find({ ownerId: userId }).toArray();
  for (const board of ownedBoards) {
    await items().deleteMany({ roomId: board.roomId });
    await boards().deleteOne({ roomId: board.roomId });
    notifyBoardDeleted(board.roomId);
  }

  // Keep other people's boards and only remove this user from their members.
  await boards().updateMany(
    { memberIds: userId },
    { $pull: { memberIds: userId } }
  );
  disconnectUserSockets(userId);
  await users().deleteOne({ _id: user._id });

  res.clearCookie(AUTH_COOKIE_NAME, AUTH_COOKIE_OPTIONS);
  res.status(200).json({ ok: true });
});

router.post("/forgot-password", forgotPasswordLimiter, async (req, res) => {
  const email = normalizeEmail(req.body.email);
  if (!isValidEmail(email)) {
    res.status(400).json({ error: "Enter a valid email address" });
    return;
  }

  const user = await users().findOne({ email });
  if (!user) {
    // Always return success here so registered emails cannot be discovered.
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
  // Never throws: true if emailed, false if it fell back to logging the link.
  // We always return 200 (even when the send fails) so this endpoint can't be
  // used to discover which emails have accounts.
  const emailed = await sendPasswordResetEmail(user.email, resetUrl);

  // Dev convenience: when no real email went out, hand the link back so the
  // reset flow is testable without SMTP. Never exposed in production.
  const body: { ok: true; resetUrl?: string } = { ok: true };
  if (!IS_PROD && !emailed) {
    body.resetUrl = resetUrl;
  }
  res.status(200).json(body);
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
      // Bumping the version cancels every cookie issued before this reset.
      $inc: { tokenVersion: 1 },
    }
  );

  disconnectUserSockets(String(user._id));

  res.status(200).json({ ok: true });
});

export default router;
