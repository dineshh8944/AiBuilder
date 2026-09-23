const config = require("./config/env"); // loads .env first
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const { notFound, errorHandler } = require("./middleware/errors");
const { isConfigured, GEMINI_MODELS } = require("./services/gemini");

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

// Allow the Vite dev server on any localhost port, plus anything in CORS_ORIGIN.
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
app.use(
  cors({
    origin(origin, cb) {
      // Not allowed -> no CORS headers, so the browser blocks the request.
      cb(null, !origin || LOCAL.test(origin) || config.CORS_ORIGINS.includes(origin));
    },
  })
);
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (req, res) => {
  res.json({ ok: true, database: mongoose.connection.readyState === 1 ? "connected" : "disconnected" });
});

// Everything below needs the database.
app.use("/api", (req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      success: false,
      message: "Database not connected. Make sure MongoDB is running and MONGODB_URI in backend/.env is correct.",
    });
  }
  next();
});

app.use("/api/auth", require("./routes/auth"));
app.use("/api/ai", require("./routes/ai"));
app.use("/api", require("./routes/api"));

app.use("/api", notFound);
app.use(errorHandler);

/* ── Start ─────────────────────────────────────────────────────────── */
async function connectWithRetry() {
  try {
    await mongoose.connect(config.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.log(`❌ MongoDB connection failed: ${err.message}\n   Retrying in 5s... (is MongoDB running?)`);
    setTimeout(connectWithRetry, 5000);
  }
}

function start() {
  connectWithRetry();
  return app.listen(config.PORT, () => {
    console.log(`🚀 Backend running on http://localhost:${config.PORT}`);
    console.log(
      isConfigured()
        ? `🤖 Gemini ready (models: ${GEMINI_MODELS.join(" → ")})`
        : "⚠️  GEMINI_API_KEY missing - AI features are disabled"
    );
  });
}

if (require.main === module) start();

module.exports = { app, start };
