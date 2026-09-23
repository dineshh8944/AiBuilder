/**
 * Loads .env and exposes validated settings in one place.
 * JWT_SECRET is what signs login tokens - if it is missing we generate a
 * temporary one (fine for local dev, but everyone gets logged out on restart).
 */
require("dotenv").config({ quiet: true });
const crypto = require("crypto");

let jwtSecret = (process.env.JWT_SECRET || "").trim();
if (!jwtSecret || jwtSecret.includes("change_me")) {
  jwtSecret = crypto.randomBytes(48).toString("hex");
  console.warn(
    "⚠️  JWT_SECRET is not set in backend/.env - using a temporary secret.\n" +
      "   Everyone will be logged out whenever the server restarts.\n" +
      "   Add a long random JWT_SECRET to backend/.env to fix this."
  );
}

const csv = (v, fallback = "") =>
  (v || fallback)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

module.exports = {
  PORT: Number(process.env.PORT) || 8000,
  NODE_ENV: process.env.NODE_ENV || "development",
  MONGODB_URI: (process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ttp_crm").trim(),
  JWT_SECRET: jwtSecret,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
  CORS_ORIGINS: csv(process.env.CORS_ORIGIN),

  GEMINI_API_KEY: (process.env.GEMINI_API_KEY || "").trim(),
  // Models are tried in this order; the next one is used if a model is
  // unavailable or its quota is used up.
  GEMINI_MODELS: [
    ...new Set([
      (process.env.GEMINI_MODEL || "gemini-3.8-flash").trim(),
      ...csv(process.env.GEMINI_FALLBACK_MODELS, "gemini-3.7-flash,gemini-3.6-flash"),
    ]),
  ],
  GEMINI_THINKING_LEVEL: (process.env.GEMINI_THINKING_LEVEL || "LOW").trim().toUpperCase(),
};
