import "dotenv/config";
import type { CookieOptions } from "express";
import { logger } from "./lib/logger.js";

// I load and validate env values here so every module gets the same config.

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    logger.error(`Missing required environment variable: ${name}`, {
      hint: "Set it in server/.env for local dev, or in your host's environment settings for production.",
    });
    process.exit(1);
  }
  return value;
}

export const IS_PROD = process.env.NODE_ENV === "production";

export const PORT = Number(process.env.PORT) || 4000;
export const MONGODB_URI = requireEnv("MONGODB_URI");
export const JWT_SECRET = requireEnv("JWT_SECRET");

// CLIENT_ORIGIN accepts one or more comma-separated origins (e.g. a deployed
// frontend + localhost while developing against a deployed API), so switching
// between local and production testing doesn't require editing this value.
function parseOrigins(raw: string): string[] {
  return raw
    .split(",")
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
}

const RAW_CLIENT_ORIGIN = IS_PROD
  ? requireEnv("CLIENT_ORIGIN")
  : process.env.CLIENT_ORIGIN || "http://localhost:3000";

export const ALLOWED_ORIGINS = parseOrigins(RAW_CLIENT_ORIGIN);
if (ALLOWED_ORIGINS.length === 0) {
  logger.error("CLIENT_ORIGIN resolved to no usable origins", { raw: RAW_CLIENT_ORIGIN });
  process.exit(1);
}

// The canonical origin used to build absolute links (e.g. the password-reset
// email) — only one concrete URL makes sense there, so we use the first
// configured origin. Put the origin you want reset links to point at first.
export const CLIENT_ORIGIN = ALLOWED_ORIGINS[0]!;

export const AUTH_COOKIE_NAME = "token";

// Production uses cross-site HTTPS cookies. Localhost needs Lax without Secure.
export const AUTH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: IS_PROD,
  sameSite: IS_PROD ? "none" : "lax",
};
