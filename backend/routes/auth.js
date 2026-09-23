const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const { User } = require("../models");
const { requireAuth, signToken } = require("../middleware/auth");
const { HttpError, pick } = require("../middleware/errors");

const router = express.Router();

// Slow down password guessing.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Too many attempts. Please wait a few minutes and try again" },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const hashPassword = (password) => bcrypt.hash(password, 10);

/** Accounts created by the old version used PBKDF2 ("salt:hash"). Still supported. */
function verifyLegacy(password, stored) {
  const [salt, original] = stored.split(":");
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512");
  const orig = Buffer.from(original, "hex");
  return orig.length === hash.length && crypto.timingSafeEqual(hash, orig);
}

async function checkPassword(user, password) {
  if (user.password.startsWith("$2")) return bcrypt.compare(password, user.password);
  if (user.password.includes(":") && verifyLegacy(password, user.password)) {
    // Upgrade old hash to bcrypt on successful login.
    user.password = await hashPassword(password);
    await user.save();
    return true;
  }
  return false;
}

const formatUser = (u) => ({
  id: u._id.toString(),
  name: u.name,
  email: u.email,
  company: u.company || "",
  avatar: u.avatar || "",
  role: u.role || "Owner",
  createdAt: u.createdAt,
});

// POST /api/auth/register
router.post("/register", authLimiter, async (req, res) => {
  const { name, email, password, company } = req.body || {};
  if (!name || !email || !password) {
    throw new HttpError(400, "Name, email, and password are required");
  }
  const cleanEmail = String(email).trim().toLowerCase();
  if (!EMAIL_RE.test(cleanEmail)) throw new HttpError(400, "Please enter a valid email address");
  if (String(password).length < 6) throw new HttpError(400, "Password must be at least 6 characters");

  if (await User.exists({ email: cleanEmail })) {
    throw new HttpError(400, "Email is already registered");
  }

  const user = await User.create({
    name: String(name).trim(),
    email: cleanEmail,
    password: await hashPassword(String(password)),
    company: String(company || "").trim(),
  });
  res.status(201).json({ success: true, token: signToken(user), user: formatUser(user) });
});

// POST /api/auth/login
router.post("/login", authLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) throw new HttpError(400, "Email and password are required");

  const user = await User.findOne({ email: String(email).trim().toLowerCase() });
  if (!user || !(await checkPassword(user, String(password)))) {
    throw new HttpError(401, "Invalid email or password");
  }
  res.json({ success: true, token: signToken(user), user: formatUser(user) });
});

// GET /api/auth/me
router.get("/me", requireAuth, (req, res) => {
  res.json({ success: true, user: formatUser(req.user) });
});

// PUT /api/auth/profile
router.put("/profile", requireAuth, async (req, res) => {
  const user = await User.findById(req.user._id);
  const { name, company, avatar, password } = pick(req.body, ["name", "company", "avatar", "password"]);

  if (name !== undefined) {
    if (!String(name).trim()) throw new HttpError(400, "Name cannot be empty");
    user.name = String(name).trim();
  }
  if (company !== undefined) user.company = String(company).trim();
  if (avatar !== undefined) user.avatar = String(avatar).trim();
  if (password) {
    if (String(password).length < 6) throw new HttpError(400, "Password must be at least 6 characters");
    user.password = await hashPassword(String(password));
  }
  await user.save();
  res.json({ success: true, user: formatUser(user) });
});

module.exports = router;
