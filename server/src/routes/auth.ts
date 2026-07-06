import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { users } from "../db.js";

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET!;
const SALT_ROUNDS = 10;

router.post("/signup", async (req, res) => {
  const { email, password } = req.body;

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
    email,
    passwordHash,
    createdAt: Date.now(),
  });

  // Sign a JWT with the new user's ID and email
  const token = jwt.sign(
    { userId: result.insertedId, email },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  // Send the token as an HTTP-only cookie so JS can't read it
  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
  });

  res.status(201).json({ email });
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
    { userId: user._id, email: user.email },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.status(200).json({ email: user.email });
});

router.get("/me", (req, res) => {
  const token = req.cookies?.token;
  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; email: string };
    res.status(200).json({ userId: decoded.userId, email: decoded.email });
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
});

router.post("/logout", (_req, res) => {
  res.clearCookie("token");
  res.status(200).json({ ok: true });
});

export default router;
