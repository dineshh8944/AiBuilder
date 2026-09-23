/**
 * Thin wrapper around the Google Gemini SDK.
 *  - lazy client (server still boots if the key is missing)
 *  - tries a list of models (GEMINI_MODEL, then GEMINI_FALLBACK_MODELS)
 *  - turns raw API errors into messages a human can act on
 */
const { GoogleGenAI } = require("@google/genai");
const { GEMINI_API_KEY, GEMINI_MODELS, GEMINI_THINKING_LEVEL } = require("../config/env");
const { HttpError } = require("../middleware/errors");

const REQUEST_TIMEOUT_MS = 60_000;

let client = null;
function getClient() {
  if (!client) client = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  return client;
}

function isConfigured() {
  return Boolean(GEMINI_API_KEY) && !/your_?key/i.test(GEMINI_API_KEY);
}

/** Google errors often arrive as a JSON string inside err.message. */
function readableMessage(err) {
  const raw = String(err?.message || err || "");
  try {
    const parsed = JSON.parse(raw);
    return parsed?.error?.message || raw;
  } catch {
    return raw;
  }
}

function toHttpError(err) {
  if (err instanceof HttpError) return err;
  const status = Number(err?.status) || 0;
  const msg = readableMessage(err);

  if (/api key not valid|api_key_invalid|invalid api key/i.test(msg) || status === 401) {
    return new HttpError(502, "Gemini rejected the API key. Check GEMINI_API_KEY in backend/.env and restart the server.");
  }
  if (status === 403) {
    return new HttpError(502, "Gemini denied the request (403). The API key may lack access, or your region isn't supported.");
  }
  if (status === 429) {
    return new HttpError(429, "Gemini usage limit reached. Please wait a minute and try again.");
  }
  if (status === 404) {
    return new HttpError(502, "The Gemini model isn't available for this key. Set GEMINI_MODEL in backend/.env to a model your key can use.");
  }
  if (status === 503 || status === 500) {
    return new HttpError(503, "Gemini is temporarily overloaded. Please try again in a moment.");
  }
  const cause = `${msg} ${err?.cause?.code || ""} ${err?.cause?.message || ""}`;
  if (!status && /fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|network/i.test(cause)) {
    return new HttpError(503, "Couldn't reach Gemini. Check your internet connection and try again.");
  }
  if (err?.name === "TimeoutError") {
    return new HttpError(504, "Gemini took too long to answer. Please try again.");
  }
  return new HttpError(502, `AI request failed: ${msg.slice(0, 200) || "unknown error"}`);
}

const withTimeout = (promise, ms) => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error("Timed out"), { name: "TimeoutError" })), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

// Errors where trying the next model in the list can help.
const shouldTryNextModel = (err) => [404, 429, 500, 503].includes(Number(err?.status)) || err?.name === "TimeoutError";

/**
 * @param {object}  opts
 * @param {Array}   opts.contents          [{ role: "user"|"model", parts: [{ text }] }] or a plain string
 * @param {string}  [opts.system]          system instruction
 * @param {boolean} [opts.json]            ask for a JSON response
 * @returns {Promise<{ text: string, model: string }>}
 */
async function generate({ contents, system, json = false }) {
  if (!isConfigured()) {
    throw new HttpError(503, "Gemini API key is missing. Add GEMINI_API_KEY to backend/.env and restart the server.");
  }

  let lastError;
  for (const model of GEMINI_MODELS) {
    const base = {};
    if (system) base.systemInstruction = system;
    if (json) base.responseMimeType = "application/json";

    // Try with the thinking level first; retry once without it if a model rejects it.
    const attempts = GEMINI_THINKING_LEVEL ? [{ ...base, thinkingConfig: { thinkingLevel: GEMINI_THINKING_LEVEL } }, base] : [base];

    for (let i = 0; i < attempts.length; i++) {
      try {
        const response = await withTimeout(
          getClient().models.generateContent({ model, contents, config: attempts[i] }),
          REQUEST_TIMEOUT_MS
        );
        const text = (response.text || "").trim();
        if (!text) throw new HttpError(502, "Gemini returned an empty answer (it may have been blocked). Try rephrasing.");
        return { text, model };
      } catch (err) {
        lastError = err;
        const thinkingRejected = i === 0 && attempts.length > 1 && Number(err?.status) === 400 && /think/i.test(readableMessage(err));
        if (thinkingRejected) continue; // retry same model without thinkingConfig
        break;
      }
    }
    if (!shouldTryNextModel(lastError)) break;
    console.warn(`[gemini] ${model} failed (${lastError?.status || lastError?.name}) - trying next model`);
  }
  throw toHttpError(lastError);
}

/** Parses model JSON even if it was wrapped in ``` fences or has stray text. */
function parseJson(text) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
  }
  throw new HttpError(502, "The AI answer wasn't in the expected format. Please try again.");
}

/** Cheap live check used by Settings -> "AI Integration". Cached briefly. */
let statusCache = { at: 0, value: null };
async function checkConnection({ force = false } = {}) {
  if (!isConfigured()) {
    return { configured: false, connected: false, model: GEMINI_MODELS[0], message: "GEMINI_API_KEY is not set in backend/.env" };
  }
  if (!force && statusCache.value && Date.now() - statusCache.at < 60_000) return statusCache.value;

  let value;
  try {
    const { model } = await generate({ contents: "Reply with the single word: ok" });
    value = { configured: true, connected: true, model };
  } catch (err) {
    value = { configured: true, connected: false, model: GEMINI_MODELS[0], message: err.message };
  }
  statusCache = { at: Date.now(), value };
  return value;
}

module.exports = { generate, parseJson, checkConnection, isConfigured, GEMINI_MODELS };
