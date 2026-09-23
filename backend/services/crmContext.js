/**
 * Builds compact, per-user snapshots of CRM data to give the AI real context.
 * Every query filters by userId, so the AI only ever sees the caller's data.
 */
const { Lead, Contact, Task, Note } = require("../models");

const STAGES = ["New", "Qualified", "Proposal", "Won", "Lost"];
const MAX_LEADS = 60;
const MAX_TASKS = 30;

const day = 24 * 60 * 60 * 1000;
const daysAgo = (d) => (d ? Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / day)) : null);
const clip = (s, n = 200) => (s ? String(s).slice(0, n) : "");
const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

function leadCard(l) {
  return {
    id: String(l._id),
    name: l.name,
    company: l.company || "",
    stage: l.status,
    priority: l.priority || "Medium",
    dealValueUSD: l.value || 0,
    source: l.source || "",
    email: l.email || "",
    notes: clip(l.notes),
    daysSinceCreated: daysAgo(l.createdAt),
    daysSinceLastUpdate: daysAgo(l.updatedAt),
  };
}

function taskCard(t) {
  return {
    title: t.title,
    status: t.status,
    priority: t.priority,
    due: iso(t.dueDate),
    overdue: Boolean(t.dueDate && t.status !== "Completed" && new Date(t.dueDate) < new Date()),
    lead: t.relatedLead?.name || null,
  };
}

function pipelineStats(leads) {
  const byStage = Object.fromEntries(STAGES.map((s) => [s, { count: 0, valueUSD: 0 }]));
  let total = 0;
  for (const l of leads) {
    const b = byStage[l.status] || (byStage[l.status] = { count: 0, valueUSD: 0 });
    b.count += 1;
    b.valueUSD += l.value || 0;
    total += l.value || 0;
  }
  const closed = byStage.Won.count + byStage.Lost.count;
  return {
    totalLeads: leads.length,
    totalPipelineValueUSD: total,
    wonRevenueUSD: byStage.Won.valueUSD,
    winRatePercent: closed ? Math.round((byStage.Won.count / closed) * 100) : null,
    byStage,
  };
}

/** Whole-account overview: stats + most relevant leads + open tasks. */
async function buildSnapshot(userId) {
  const [allLeads, contactsCount, tasks] = await Promise.all([
    Lead.find({ user: userId }).sort({ updatedAt: -1 }).lean(),
    Contact.countDocuments({ user: userId }),
    Task.find({ user: userId, status: { $ne: "Completed" } })
      .populate("relatedLead", "name")
      .sort({ dueDate: 1 })
      .limit(MAX_TASKS)
      .lean(),
  ]);

  return {
    today: iso(new Date()),
    stats: { ...pipelineStats(allLeads), totalContacts: contactsCount, openTasks: tasks.length },
    leads: allLeads.slice(0, MAX_LEADS).map(leadCard),
    leadsNotShown: Math.max(0, allLeads.length - MAX_LEADS),
    openTasks: tasks.map(taskCard),
  };
}

/** Everything known about a single lead (must belong to userId). */
async function buildLeadContext(userId, leadId) {
  const lead = await Lead.findOne({ _id: leadId, user: userId }).lean();
  if (!lead) return null;
  const [tasks, notes] = await Promise.all([
    Task.find({ user: userId, relatedLead: leadId }).sort({ dueDate: 1 }).limit(10).lean(),
    Note.find({ user: userId, lead: leadId }).sort({ createdAt: -1 }).limit(5).lean(),
  ]);
  return {
    lead,
    context: {
      today: iso(new Date()),
      lead: leadCard(lead),
      tasks: tasks.map(taskCard),
      notes: notes.map((n) => ({ date: iso(n.createdAt), text: clip(n.content, 300) })),
    },
  };
}

module.exports = { buildSnapshot, buildLeadContext };
