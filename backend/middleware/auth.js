const jwt = require("jsonwebtoken");
const { JWT_SECRET, JWT_EXPIRES_IN } = require("../config/env");
const { User } = require("../models");

function signToken(user) {
  return jwt.sign({ sub: user._id.toString() }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verifies the Bearer token and loads the account into req.user.
 * Every data route sits behind this, and every query then filters by
 * req.user._id - so a user can only ever see their own records.
 */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (!token) {
    return res.status(401).json({ success: false, message: "Please log in to continue" });
  }

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res
      .status(401)
      .json({ success: false, message: "Your session has expired. Please log in again" });
  }

  const user = await User.findById(payload.sub).select("-password");
  if (!user) {
    return res.status(401).json({ success: false, message: "Account not found. Please log in again" });
  }
  req.user = user;
  next();
}

module.exports = { requireAuth, signToken };
