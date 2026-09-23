const express = require("express");
const { Lead, Contact, Task, Note } = require("../models");
const { requireAuth } = require("../middleware/auth");
const { HttpError, isId, pick } = require("../middleware/errors");

const router = express.Router();

/* ─────────────────────────────────────────────────────────────────────────
   DATA SEPARATION
   Everything below is behind requireAuth and EVERY query includes
   `user: req.user._id`. Users therefore never see (or touch) anyone else's
   leads, contacts, tasks or notes - even if they guess an id.
   ───────────────────────────────────────────────────────────────────────── */
router.use(requireAuth);

const LEAD_FIELDS = ["name", "company", "status", "priority", "value", "email", "phone", "source", "notes", "order", "tags", "aiSummary", "aiRiskScore"];
const CONTACT_FIELDS = ["name", "title", "email", "phone", "company", "notes", "tags", "favorite"];
const TASK_FIELDS = ["title", "description", "priority", "status", "dueDate", "relatedLead", "relatedContact"];
const NOTE_FIELDS = ["content", "pinned", "lead", "contact"];

/** Accepts an id string or a populated object ({ _id }) and returns the id. */
const toId = (v) => (v && typeof v === "object" && v._id ? String(v._id) : v);

/**
 * Validates a linked record (e.g. a task's lead). It must exist AND belong to
 * the same user - otherwise populate() could leak another account's data.
 * Returns undefined (leave unchanged), null (clear) or the valid id.
 */
async function ownedRef(Model, value, userId, label) {
  if (value === undefined) return undefined;
  const id = toId(value);
  if (id === null || id === "") return null;
  if (!isId(id)) throw new HttpError(400, `Invalid ${label}`);
  if (!(await Model.exists({ _id: id, user: userId }))) throw new HttpError(400, `${label} not found`);
  return id;
}

function requireId(req) {
  if (!isId(req.params.id)) throw new HttpError(404, "Not found");
  return req.params.id;
}

const found = (doc, label) => {
  if (!doc) throw new HttpError(404, `${label} not found`);
  return doc;
};

/* ── LEADS ──────────────────────────────────────────────────────────── */
router.get("/leads", async (req, res) => {
  const leads = await Lead.find({ user: req.user._id }).sort({ order: 1, createdAt: -1 });
  res.json({ success: true, count: leads.length, leads });
});

// Declared before "/leads/:id" so "reorder" is never treated as an id.
router.patch("/leads/reorder", async (req, res) => {
  const updates = Array.isArray(req.body?.updates) ? req.body.updates : [];
  const ops = updates
    .filter((u) => isId(String(u.id)))
    .map((u) => ({
      updateOne: {
        filter: { _id: u.id, user: req.user._id },
        update: { $set: { status: u.status, order: Number(u.order) || 0 } },
      },
    }));
  if (ops.length) await Lead.bulkWrite(ops);
  res.json({ success: true, message: "Pipeline updated" });
});

router.get("/leads/:id", async (req, res) => {
  const lead = found(await Lead.findOne({ _id: requireId(req), user: req.user._id }), "Lead");
  res.json({ success: true, lead });
});

router.post("/leads", async (req, res) => {
  const lead = await Lead.create({ ...pick(req.body, LEAD_FIELDS), user: req.user._id });
  res.status(201).json({ success: true, lead });
});

router.put("/leads/:id", async (req, res) => {
  const lead = found(
    await Lead.findOneAndUpdate(
      { _id: requireId(req), user: req.user._id },
      { $set: pick(req.body, LEAD_FIELDS) },
      { returnDocument: "after", runValidators: true }
    ),
    "Lead"
  );
  res.json({ success: true, lead });
});

router.delete("/leads/:id", async (req, res) => {
  const id = requireId(req);
  found(await Lead.findOneAndDelete({ _id: id, user: req.user._id }), "Lead");
  // Unlink (don't delete) anything that pointed at this lead.
  await Promise.all([
    Task.updateMany({ user: req.user._id, relatedLead: id }, { $set: { relatedLead: null } }),
    Note.updateMany({ user: req.user._id, lead: id }, { $set: { lead: null } }),
  ]);
  res.json({ success: true, message: "Lead deleted" });
});

/* ── CONTACTS ───────────────────────────────────────────────────────── */
router.get("/contacts", async (req, res) => {
  const contacts = await Contact.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.json({ success: true, count: contacts.length, contacts });
});

router.get("/contacts/:id", async (req, res) => {
  const contact = found(await Contact.findOne({ _id: requireId(req), user: req.user._id }), "Contact");
  res.json({ success: true, contact });
});

/** A person can only be saved once per account (other accounts are unaffected). */
async function assertUniqueContactEmail(userId, email, excludeId) {
  const clean = String(email || "").trim().toLowerCase();
  if (!clean) return;
  const query = { user: userId, email: clean };
  if (excludeId) query._id = { $ne: excludeId };
  if (await Contact.exists(query)) {
    throw new HttpError(409, "You already have a contact with this email");
  }
}

router.post("/contacts", async (req, res) => {
  const data = pick(req.body, CONTACT_FIELDS);
  await assertUniqueContactEmail(req.user._id, data.email);
  const contact = await Contact.create({ ...data, user: req.user._id });
  res.status(201).json({ success: true, contact });
});

router.put("/contacts/:id", async (req, res) => {
  const id = requireId(req);
  const data = pick(req.body, CONTACT_FIELDS);
  if (data.email !== undefined) await assertUniqueContactEmail(req.user._id, data.email, id);
  const contact = found(
    await Contact.findOneAndUpdate({ _id: id, user: req.user._id }, { $set: data }, { returnDocument: "after", runValidators: true }),
    "Contact"
  );
  res.json({ success: true, contact });
});

router.delete("/contacts/:id", async (req, res) => {
  const id = requireId(req);
  found(await Contact.findOneAndDelete({ _id: id, user: req.user._id }), "Contact");
  await Promise.all([
    Task.updateMany({ user: req.user._id, relatedContact: id }, { $set: { relatedContact: null } }),
    Note.updateMany({ user: req.user._id, contact: id }, { $set: { contact: null } }),
  ]);
  res.json({ success: true, message: "Contact deleted" });
});

/* ── TASKS ──────────────────────────────────────────────────────────── */
async function taskData(req) {
  const data = pick(req.body, TASK_FIELDS);
  const uid = req.user._id;
  const lead = await ownedRef(Lead, data.relatedLead, uid, "Lead");
  const contact = await ownedRef(Contact, data.relatedContact, uid, "Contact");
  if (lead !== undefined) data.relatedLead = lead;
  if (contact !== undefined) data.relatedContact = contact;
  if (data.dueDate === "") data.dueDate = null;
  return data;
}

router.get("/tasks", async (req, res) => {
  const tasks = await Task.find({ user: req.user._id })
    .populate("relatedLead relatedContact")
    .sort({ createdAt: -1 });
  res.json({ success: true, count: tasks.length, tasks });
});

router.post("/tasks", async (req, res) => {
  const data = await taskData(req);
  if (data.status === "Completed") data.completedAt = new Date();
  const task = await Task.create({ ...data, user: req.user._id });
  await task.populate("relatedLead relatedContact");
  res.status(201).json({ success: true, task });
});

router.put("/tasks/:id", async (req, res) => {
  const data = await taskData(req);
  if (data.status === "Completed") data.completedAt = new Date();
  else if (data.status) data.completedAt = null;

  const task = found(
    await Task.findOneAndUpdate({ _id: requireId(req), user: req.user._id }, { $set: data }, { returnDocument: "after", runValidators: true })
      .populate("relatedLead relatedContact"),
    "Task"
  );
  res.json({ success: true, task });
});

router.delete("/tasks/:id", async (req, res) => {
  found(await Task.findOneAndDelete({ _id: requireId(req), user: req.user._id }), "Task");
  res.json({ success: true, message: "Task deleted" });
});

/* ── NOTES ──────────────────────────────────────────────────────────── */
async function noteData(req) {
  const data = pick(req.body, NOTE_FIELDS);
  const uid = req.user._id;
  const lead = await ownedRef(Lead, data.lead, uid, "Lead");
  const contact = await ownedRef(Contact, data.contact, uid, "Contact");
  if (lead !== undefined) data.lead = lead;
  if (contact !== undefined) data.contact = contact;
  return data;
}

router.get("/notes", async (req, res) => {
  const notes = await Note.find({ user: req.user._id }).populate("lead contact").sort({ pinned: -1, createdAt: -1 });
  res.json({ success: true, count: notes.length, notes });
});

router.post("/notes", async (req, res) => {
  const note = await Note.create({ ...(await noteData(req)), user: req.user._id });
  await note.populate("lead contact");
  res.status(201).json({ success: true, note });
});

router.put("/notes/:id", async (req, res) => {
  const note = found(
    await Note.findOneAndUpdate(
      { _id: requireId(req), user: req.user._id },
      { $set: await noteData(req) },
      { returnDocument: "after", runValidators: true }
    ).populate("lead contact"),
    "Note"
  );
  res.json({ success: true, note });
});

router.delete("/notes/:id", async (req, res) => {
  found(await Note.findOneAndDelete({ _id: requireId(req), user: req.user._id }), "Note");
  res.json({ success: true, message: "Note deleted" });
});

/* ── ANALYTICS (this user's numbers only) ───────────────────────────── */
const STAGES = ["New", "Qualified", "Proposal", "Won", "Lost"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

router.get("/analytics/overview", async (req, res) => {
  const uid = req.user._id;
  const [leads, contactsCount, openTasks] = await Promise.all([
    Lead.find({ user: uid }).lean(),
    Contact.countDocuments({ user: uid }),
    Task.countDocuments({ user: uid, status: { $ne: "Completed" } }),
  ]);

  const byStage = Object.fromEntries(STAGES.map((s) => [s, { count: 0, value: 0 }]));
  let totalValue = 0;
  let wonValue = 0;
  for (const l of leads) {
    const b = byStage[l.status] || (byStage[l.status] = { count: 0, value: 0 });
    b.count += 1;
    b.value += l.value || 0;
    totalValue += l.value || 0;
    if (l.status === "Won") wonValue += l.value || 0;
  }
  const closed = byStage.Won.count + byStage.Lost.count;
  const conversionRate = closed ? Math.round((byStage.Won.count / closed) * 100) : 0;

  // Last 6 months trend
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: MONTHS[d.getMonth()] });
  }
  const idx = Object.fromEntries(months.map((m, i) => [m.key, i]));
  const trend = months.map((m) => ({ month: m.label, leads: 0, won: 0 }));
  for (const l of leads) {
    const d = new Date(l.createdAt);
    const i = idx[`${d.getFullYear()}-${d.getMonth()}`];
    if (i !== undefined) {
      trend[i].leads += 1;
      if (l.status === "Won") trend[i].won += l.value || 0;
    }
  }

  const recentLeads = [...leads]
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, 6)
    .map((l) => ({ id: l._id, name: l.name, company: l.company, status: l.status, value: l.value, updatedAt: l.updatedAt }));

  res.json({
    success: true,
    stats: { revenueWon: wonValue, pipelineValue: totalValue, totalLeads: leads.length, totalContacts: contactsCount, openTasks, conversionRate },
    pipeline: STAGES.map((s) => ({ stage: s, count: byStage[s].count, value: byStage[s].value })),
    trend,
    recentLeads,
  });
});

module.exports = router;
