/** Small helpers + one central error handler so routes stay short. */

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const isId = (v) => typeof v === "string" && /^[0-9a-fA-F]{24}$/.test(v);

/** Copy only the allowed keys - stops clients from setting `user`, `_id`, etc. */
function pick(obj = {}, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

function notFound(req, res) {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = err.status || err.statusCode || 500;
  let message = err.message || "Server error";

  if (err.type === "entity.parse.failed") {
    status = 400;
    message = "Invalid JSON in request body";
  } else if (err.name === "ValidationError") {
    status = 400;
    message = Object.values(err.errors || {})
      .map((e) => e.message)
      .join(", ") || message;
  } else if (err.name === "CastError") {
    status = 400;
    message = `Invalid value for ${err.path}`;
  } else if (err.code === 11000) {
    status = 409;
    message = "That record already exists";
  }

  if (status >= 500) console.error(`[${req.method} ${req.originalUrl}]`, err);
  res.status(status).json({ success: false, message });
}

module.exports = { HttpError, isId, pick, notFound, errorHandler };
