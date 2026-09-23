/** Unit tests for the Gemini wrapper: model fallback, retries, friendly errors. No network. */
const test = require("node:test");
const assert = require("node:assert/strict");

process.env.GEMINI_API_KEY = "fake-test-key";
process.env.GEMINI_MODEL = "m1";
process.env.GEMINI_FALLBACK_MODELS = "m2,m3";

let script = []; // each entry: (req) => response | throws
const seen = [];
class FakeGenAI {
  constructor() {
    this.models = {
      generateContent: async (req) => {
        seen.push(req);
        return script.shift()(req);
      },
    };
  }
}
const sdkPath = require.resolve("@google/genai");
require.cache[sdkPath] = { id: sdkPath, filename: sdkPath, loaded: true, exports: { GoogleGenAI: FakeGenAI } };

const { generate, parseJson } = require("../services/gemini");

const apiError = (status, message) => Object.assign(new Error(message), { status });
const run = async (steps) => {
  script = steps;
  seen.length = 0;
  return generate({ contents: "hi" });
};

test("uses the first model when it works", async () => {
  const r = await run([() => ({ text: "ok" })]);
  assert.deepEqual([r.text, r.model], ["ok", "m1"]);
});

test("falls back to the next model on quota (429) and on missing model (404 / 503)", async () => {
  assert.equal((await run([() => { throw apiError(429, "quota"); }, () => ({ text: "from m2" })])).model, "m2");
  const r = await run([() => { throw apiError(404, "no model"); }, () => { throw apiError(503, "busy"); }, () => ({ text: "from m3" })]);
  assert.equal(r.model, "m3");
});

test("retries the same model without thinkingConfig if it is rejected", async () => {
  const r = await run([() => { throw apiError(400, "thinking_level is not supported"); }, () => ({ text: "ok" })]);
  assert.equal(r.model, "m1");
  assert.ok(seen[0].config.thinkingConfig);
  assert.equal(seen[1].config.thinkingConfig, undefined);
});

test("an invalid API key gives a clear message and does not burn through every model", async () => {
  await assert.rejects(run([() => { throw apiError(400, JSON.stringify({ error: { message: "API key not valid. Please pass a valid API key." } })); }]), (e) => {
    assert.match(e.message, /rejected the API key/);
    return true;
  });
  assert.equal(seen.length, 1);
});

test("all models rate-limited -> friendly 429", async () => {
  await assert.rejects(run([() => { throw apiError(429, "x"); }, () => { throw apiError(429, "x"); }, () => { throw apiError(429, "x"); }]), (e) => {
    assert.equal(e.status, 429);
    assert.match(e.message, /usage limit/i);
    return true;
  });
});

test("empty answers are reported instead of returned", async () => {
  await assert.rejects(run([() => ({ text: "" })]), /empty answer/);
});

test("parseJson copes with code fences and stray text", () => {
  assert.deepEqual(parseJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJson('Sure! Here you go: {"a":2} hope that helps'), { a: 2 });
  assert.throws(() => parseJson("no json here"), /expected format/);
});

test("network failures get a clear message", async () => {
  await assert.rejects(run([() => { throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } }); }]), /Couldn't reach Gemini/);
});
