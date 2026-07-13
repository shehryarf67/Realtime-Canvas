import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { users } from "../db.js";
import { isValidEmail, isValidPassword, isNonEmptyString, MIN_PASSWORD_LENGTH } from "../lib/validation.js";
import { sendPasswordResetEmail } from "../lib/mailer.js";

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET!;
const SALT_ROUNDS = 10;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:3000";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

router.post("/signup", async (req, res) => {
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

  // Send the token as an HTTP-only cookie so JS can't read it
  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
  });

  res.status(201).json({ userId: result.insertedId, name, email });
});

router.post("/login", async (req, res) => {
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

  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
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
  res.clearCookie("token");
  res.status(200).json({ ok: true });
});

router.post("/forgot-password", async (req, res) => {
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

router.post("/reset-password", async (req, res) => {
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
