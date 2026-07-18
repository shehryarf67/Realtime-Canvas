import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config.js";
import { users } from "../db.js";

export type AuthPayload = {
  userId: string;
  name: string;
  email: string;
  tokenVersion: number;
};

// Single source of truth for accepting a token. Verifies the JWT signature AND
// that its tokenVersion still matches the user's current value in the DB, so a
// tokenVersion bump (e.g. on password reset) invalidates every token issued
// before it. Returns the payload on success, or null if the token is
// invalid/expired/superseded or the user no longer exists.
//
// We look the user up by email (carried in the signed token, and unique) to
// avoid converting the JWT's stringified userId back into an ObjectId.
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

  return decoded;
}
