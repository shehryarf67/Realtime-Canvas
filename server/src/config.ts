import "dotenv/config";
import type { CookieOptions } from "express";

// Central place for environment config. Every module that needs env values
// imports from here, which guarantees dotenv has run first regardless of
// module evaluation order — no more relying on index.ts importing
// "dotenv/config" before anything else.

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(
      `Missing required environment variable: ${name}\n` +
        `Set it in server/.env for local dev, or in your host's environment settings for production.`
    );
    process.exit(1);
  }
  return value;
}

export const IS_PROD = process.env.NODE_ENV === "production";

export const PORT = Number(process.env.PORT) || 4000;
export const MONGODB_URI = requireEnv("MONGODB_URI");
export const JWT_SECRET = requireEnv("JWT_SECRET");

// In production the frontend and this API live on different domains, so the
// browser only accepts/sends the auth cookie cross-site — and browsers refuse
// a wildcard or mismatched origin when credentials are involved. Fail loudly
// if it's not configured rather than shipping a broken login.
export const CLIENT_ORIGIN = IS_PROD
  ? requireEnv("CLIENT_ORIGIN")
  : process.env.CLIENT_ORIGIN || "http://localhost:3000";

export const AUTH_COOKIE_NAME = "token";

// Cross-site cookies (Vercel frontend -> API on another domain) require
// SameSite=None, and browsers only accept SameSite=None with Secure — which
// in turn only works over HTTPS. Locally we're on plain http://localhost, so
// Secure must be off and Lax is the right default.
export const AUTH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: IS_PROD,
  sameSite: IS_PROD ? "none" : "lax",
};
