/**
 * Integration tests: proves accounts are fully separated and the AI routes
 * return what the frontend expects. Gemini is faked - no API key or quota used.
 *
 *   npm test        (needs MongoDB running; uses a throw-away test database)
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

process.env.MONGODB_URI = process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27017/ttp_crm_test";
process.env.JWT_SECRET = "test-secret-test-secret-test-secret";
process.env.GEMINI_API_KEY = "fake-test-key";

/* ── Fake Gemini SDK (installed before any app code is loaded) ─────────── */
const calls = [];
class FakeGenAI {
  constructor() {
    this.models = {
      generateContent: async (req) => {
        calls.push(req);
        const system = String(req.config?.systemInstruction || "");
        const wantsJson = req.config?.responseMimeType === "application/json";
        let out = "Hello from the fake AI";
        if (wantsJson && system.includes('"riskScore"')) {
          out = JSON.stringify({ summary: "Warm lead.", riskScore: 140, suggestedPriority: "Urgent", nextBestAction: "Call them." });
        } else if (wantsJson && system.includes('"subject"')) {
          out = "```json\n" + JSON.stringify({ subject: "Quick follow-up", body: "Hi Asha,\n\nThanks!\n\nLucky" }) + "\n```";
        } else if (wantsJson && system.includes('"healthScore"')) {
          out = JSON.stringify({ healthScore: 72, headline: "Healthy.", insights: ["a", "b"], recommendations: ["c"] });
        }
        return { text: out };
      },
    };
  }
}
const sdkPath = require.resolve("@google/genai");
require.cache[sdkPath] = { id: sdkPath, filename: sdkPath, loaded: true, exports: { GoogleGenAI: FakeGenAI } };

const mongoose = require("mongoose");
const { app } = require("../server");
const { User } = require("../models");

let server, base;
const api = async (method, path, { token, body } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
};

const register = async (name) => {
  const email = `${name.toLowerCase()}-${crypto.randomBytes(3).toString("hex")}@test.dev`;
  const { data } = await api("POST", "/api/auth/register", { body: { name, email, password: "secret123", company: `${name} Co` } });
  return { token: data.token, id: data.user.id, email };
};

test.before(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  try { await mongoose.connection.dropDatabase(); } catch { /* ignore */ }
  await mongoose.disconnect();
  server.close();
});

test("accounts, tokens and the old insecure token format", async () => {
  const a = await register("Asha");
  const me = await api("GET", "/api/auth/me", { token: a.token });
  assert.equal(me.status, 200);
  assert.equal(me.data.user.email, a.email);

  // The old version issued unsigned base64 tokens - anyone could forge them.
  const forged = Buffer.from(JSON.stringify({ email: a.email })).toString("base64url");
  assert.equal((await api("GET", "/api/auth/me", { token: forged })).status, 401);

  for (const p of ["/api/leads", "/api/contacts", "/api/tasks", "/api/notes", "/api/analytics/overview"]) {
    assert.equal((await api("GET", p)).status, 401, `${p} must need login`);
  }
  assert.equal((await api("POST", "/api/ai/chat", { body: { message: "hi" } })).status, 401);

  const bad = await api("POST", "/api/auth/login", { body: { email: a.email, password: "wrong" } });
  assert.equal(bad.status, 401);
});

test("old PBKDF2 accounts can still log in and are upgraded to bcrypt", async () => {
  const email = `legacy-${crypto.randomBytes(3).toString("hex")}@test.dev`;
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync("oldpass1", salt, 1000, 64, "sha512").toString("hex");
  await User.create({ name: "Legacy", email, password: `${salt}:${hash}` });

  const res = await api("POST", "/api/auth/login", { body: { email, password: "oldpass1" } });
  assert.equal(res.status, 200);
  assert.ok((await User.findOne({ email })).password.startsWith("$2"));
});

test("each user only ever sees their own data", async () => {
  const a = await register("Asha");
  const b = await register("Bala");

  const lead = (await api("POST", "/api/leads", { token: a.token, body: { name: "Acme Corp Lead", company: "Acme", value: 5000, priority: "High", notes: "Wants a demo", status: "Proposal" } })).data.lead;
  const contact = (await api("POST", "/api/contacts", { token: a.token, body: { name: "Priya", email: "priya@acme.com", title: "CTO", notes: "VIP" } })).data.contact;
  const task = (await api("POST", "/api/tasks", { token: a.token, body: { title: "Call Acme", relatedLead: lead._id } })).data.task;
  const note = (await api("POST", "/api/notes", { token: a.token, body: { content: "Secret note", lead: lead._id } })).data.note;

  // Fields the old schema silently dropped are now stored.
  assert.equal(lead.priority, "High");
  assert.equal(lead.notes, "Wants a demo");
  assert.equal(contact.title, "CTO");
  assert.equal(contact.notes, "VIP");

  // B sees nothing of A's.
  for (const [path, key] of [["leads", "leads"], ["contacts", "contacts"], ["tasks", "tasks"], ["notes", "notes"]]) {
    const r = await api("GET", `/api/${path}`, { token: b.token });
    assert.equal(r.data[key].length, 0, `B must not see A's ${path}`);
    const mine = await api("GET", `/api/${path}`, { token: a.token });
    assert.equal(mine.data[key].length, 1);
  }

  // B cannot read / edit / delete A's records by id.
  assert.equal((await api("GET", `/api/leads/${lead._id}`, { token: b.token })).status, 404);
  assert.equal((await api("PUT", `/api/leads/${lead._id}`, { token: b.token, body: { name: "Hacked" } })).status, 404);
  assert.equal((await api("DELETE", `/api/leads/${lead._id}`, { token: b.token })).status, 404);
  assert.equal((await api("PUT", `/api/contacts/${contact._id}`, { token: b.token, body: { name: "Hacked" } })).status, 404);
  assert.equal((await api("DELETE", `/api/tasks/${task._id}`, { token: b.token })).status, 404);
  assert.equal((await api("PUT", `/api/notes/${note._id}`, { token: b.token, body: { content: "Hacked" } })).status, 404);

  // B cannot link their records to A's (would leak A's data through populate).
  assert.equal((await api("POST", "/api/tasks", { token: b.token, body: { title: "x", relatedLead: lead._id } })).status, 400);
  assert.equal((await api("POST", "/api/notes", { token: b.token, body: { content: "x", lead: lead._id } })).status, 400);

  // B cannot reorder A's pipeline.
  await api("PATCH", "/api/leads/reorder", { token: b.token, body: { updates: [{ id: lead._id, status: "Lost", order: 9 }] } });

  // B cannot claim ownership via the request body.
  const sneaky = (await api("POST", "/api/leads", { token: b.token, body: { name: "Bala's", user: a.id } })).data.lead;
  assert.equal(String(sneaky.user), b.id);

  // A's data is untouched.
  const after = (await api("GET", `/api/leads/${lead._id}`, { token: a.token })).data.lead;
  assert.equal(after.name, "Acme Corp Lead");
  assert.equal(after.status, "Proposal");
  assert.equal(after.order, 0);

  // Analytics are per-user.
  const sa = (await api("GET", "/api/analytics/overview", { token: a.token })).data.stats;
  const sb = (await api("GET", "/api/analytics/overview", { token: b.token })).data.stats;
  assert.equal(sa.totalLeads, 1);
  assert.equal(sa.totalContacts, 1);
  assert.equal(sb.totalLeads, 1); // only Bala's own
  assert.equal(sb.totalContacts, 0);
});

test("contacts are unique per account, not across accounts", async () => {
  const a = await register("Asha");
  const b = await register("Bala");
  const body = { name: "Shared Person", email: "same@person.com" };

  assert.equal((await api("POST", "/api/contacts", { token: a.token, body })).status, 201);
  assert.equal((await api("POST", "/api/contacts", { token: a.token, body: { ...body, email: "SAME@person.com" } })).status, 409);
  assert.equal((await api("POST", "/api/contacts", { token: b.token, body })).status, 201);
});

test("deleting a lead unlinks its tasks and notes instead of breaking them", async () => {
  const a = await register("Asha");
  const lead = (await api("POST", "/api/leads", { token: a.token, body: { name: "Temp" } })).data.lead;
  await api("POST", "/api/tasks", { token: a.token, body: { title: "T", relatedLead: lead._id } });
  await api("DELETE", `/api/leads/${lead._id}`, { token: a.token });
  const tasks = (await api("GET", "/api/tasks", { token: a.token })).data.tasks;
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].relatedLead, null);
});

test("task completion timestamps and bad ids", async () => {
  const a = await register("Asha");
  const t = (await api("POST", "/api/tasks", { token: a.token, body: { title: "Do it" } })).data.task;
  const done = (await api("PUT", `/api/tasks/${t._id}`, { token: a.token, body: { status: "Completed" } })).data.task;
  assert.ok(done.completedAt);
  const reopened = (await api("PUT", `/api/tasks/${t._id}`, { token: a.token, body: { status: "Pending" } })).data.task;
  assert.equal(reopened.completedAt, null);
  assert.equal((await api("GET", "/api/leads/not-an-id", { token: a.token })).status, 404);
});

test("AI routes return the shape the frontend expects, using only the caller's data", async () => {
  const a = await register("Asha");
  const b = await register("Bala");
  const lead = (await api("POST", "/api/leads", { token: a.token, body: { name: "Zebra Industries Lead", value: 1234 } })).data.lead;
  await api("POST", "/api/leads", { token: b.token, body: { name: "Bala Only Lead" } });

  // Lead summary (fake returns riskScore 140 + priority "Urgent" -> must be normalised).
  const sum = await api("POST", "/api/ai/lead-summary", { token: a.token, body: { leadId: lead._id } });
  assert.equal(sum.status, 200);
  assert.equal(sum.data.summary, "Warm lead.");
  assert.equal(sum.data.riskScore, 100);
  assert.equal(sum.data.suggestedPriority, "Medium");
  assert.equal(sum.data.nextBestAction, "Call them.");
  assert.equal((await api("GET", `/api/leads/${lead._id}`, { token: a.token })).data.lead.aiRiskScore, 100);

  // B cannot run AI on A's lead.
  assert.equal((await api("POST", "/api/ai/lead-summary", { token: b.token, body: { leadId: lead._id } })).status, 404);
  assert.equal((await api("POST", "/api/ai/generate-email", { token: b.token, body: { leadId: lead._id } })).status, 404);

  // Email (fake wraps JSON in code fences - must still parse).
  const email = await api("POST", "/api/ai/generate-email", { token: a.token, body: { leadId: lead._id, purpose: "Follow-up", tone: "Formal" } });
  assert.equal(email.status, 200);
  assert.equal(email.data.subject, "Quick follow-up");
  assert.match(email.data.body, /Thanks!/);

  // Insights.
  const ins = await api("POST", "/api/ai/sales-insights", { token: a.token, body: {} });
  assert.equal(ins.data.healthScore, 72);
  assert.deepEqual(ins.data.recommendations, ["c"]);

  // Chat: A's data reaches the model for A, never for B.
  calls.length = 0;
  const chatA = await api("POST", "/api/ai/chat", { token: a.token, body: { message: "What leads do I have?", history: [{ role: "ai", text: "Hi!" }, { role: "user", text: "hello" }, { role: "ai", text: "Hey" }] } });
  assert.equal(chatA.data.reply, "Hello from the fake AI");
  const sentA = calls.at(-1);
  assert.match(String(sentA.config.systemInstruction), /Zebra Industries Lead/);
  assert.equal(sentA.contents[0].role, "user"); // greeting (model turn) dropped from the start
  assert.equal(sentA.contents.at(-1).parts[0].text, "What leads do I have?");

  await api("POST", "/api/ai/chat", { token: b.token, body: { message: "What leads do I have?" } });
  const sentB = String(calls.at(-1).config.systemInstruction);
  assert.match(sentB, /Bala Only Lead/);
  assert.doesNotMatch(sentB, /Zebra/);

  // Empty account -> friendly answer without calling the AI.
  const c = await register("Chitra");
  calls.length = 0;
  const empty = await api("POST", "/api/ai/sales-insights", { token: c.token, body: {} });
  assert.equal(empty.data.healthScore, 0);
  assert.equal(calls.length, 0);

  // Status endpoint.
  const status = await api("GET", "/api/ai/status", { token: a.token });
  assert.equal(status.data.configured, true);
  assert.equal(status.data.connected, true);
});
