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

// Production needs an exact frontend origin because auth cookies are cross-site.
export const CLIENT_ORIGIN = IS_PROD
  ? requireEnv("CLIENT_ORIGIN")
  : process.env.CLIENT_ORIGIN || "http://localhost:3000";

export const AUTH_COOKIE_NAME = "token";

// Production uses cross-site HTTPS cookies. Localhost needs Lax without Secure.
export const AUTH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: IS_PROD,
  sameSite: IS_PROD ? "none" : "lax",
};
