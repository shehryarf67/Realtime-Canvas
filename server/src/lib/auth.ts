import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config.js";
import { users } from "../db.js";

export type AuthPayload = {
  userId: string;
  name: string;
  email: string;
  tokenVersion: number;
};

// This is the one place that accepts JWTs. The DB version check lets password
// changes cancel old tokens. Email is used because it is signed and unique.
export async function verifyToken(token: string): Promise<AuthPayload | null> {
  let decoded: AuthPayload;
  try {
    decoded = jwt.verify(token, JWT_SECRET) as AuthPayload;
  } catch {
    return null;
  }

  const user = await users().findOne({ email: decoded.email });
  if (!user) return null;
  if ((user.tokenVersion ?? 0) !== (decoded.tokenVersion ?? 0)) return null;

  // I return current DB values so an older cookie still sees profile updates.
  return {
    userId: String(user._id),
    name: user.name,
    email: user.email,
    tokenVersion: user.tokenVersion ?? 0,
  };
}
