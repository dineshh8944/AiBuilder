import {
  makeLeads,
  makeContacts,
  makeNotes,
  makeTasks,
  mockUser,
  mockAiStatus,
  mockAiSummary,
  mockAiEmail,
  mockAiInsights,
} from "./mockData";

// Tiny artificial delay to simulate network latency
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// In-memory store
let store = {
  user: mockUser,
  leads: makeLeads(),
  contacts: makeContacts(),
  notes: makeNotes(),
  tasks: makeTasks(),
};

// Reset store
const resetStore = () => {
  store = {
    user: mockUser,
    leads: makeLeads(),
    contacts: makeContacts(),
    notes: makeNotes(),
    tasks: makeTasks(),
  };
};

export const authApi = {
  login: async (data) => {
    await delay(400);
    if (data.email === mockUser.email && data.password === "password") {
      return { success: true, token: "mock-jwt-token-123" };
    }
    throw { status: 401, message: "Invalid credentials" };
  },
  register: async (data) => {
    await delay(400);
    return { success: true, token: "mock-jwt-token-123" };
  },
  me: async () => {
    await delay(200);
    return { success: true, user: store.user };
  },
  updateProfile: async (data) => {
    await delay(300);
    store.user = { ...store.user, ...data };
    return { success: true, user: store.user };
  },
};

export const leadsApi = {
  list: async (params) => {
    await delay(300);
    return { success: true, count: store.leads.length, leads: store.leads };
  },
  get: async (id) => {
    await delay(200);
    const lead = store.leads.find((l) => l._id === id);
    if (!lead) throw { status: 404, message: "Lead not found" };
    return { success: true, lead };
  },
  create: async (data) => {
    await delay(300);
    const id = `l${Math.max(...store.leads.map((l) => parseInt(l._id.slice(1)))) + 1}`;
    const lead = { _id: id, ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    store.leads.push(lead);
    return { success: true, lead };
  },
  update: async (id, data) => {
    await delay(300);
    const idx = store.leads.findIndex((l) => l._id === id);
    if (idx === -1) throw { status: 404, message: "Lead not found" };
    store.leads[idx] = { ...store.leads[idx], ...data, updatedAt: new Date().toISOString() };
    return { success: true, lead: store.leads[idx] };
  },
  remove: async (id) => {
    await delay(300);
    const idx = store.leads.findIndex((l) => l._id === id);
    if (idx === -1) throw { status: 404, message: "Lead not found" };
    store.leads.splice(idx, 1);
    return { success: true, message: "Lead deleted" };
  },
  reorder: async (updates) => {
    await delay(300);
    updates.forEach(({ id, order }) => {
      const lead = store.leads.find((l) => l._id === id);
      if (lead) lead.order = order;
    });
    return { success: true };
  },
};

export const contactsApi = {
  list: async (params) => {
    await delay(300);
    return { success: true, count: store.contacts.length, contacts: store.contacts };
  },
  get: async (id) => {
    await delay(200);
    const contact = store.contacts.find((c) => c._id === id);
    if (!contact) throw { status: 404, message: "Contact not found" };
    return { success: true, contact };
  },
  create: async (data) => {
    await delay(300);
    const id = `c${Math.max(...store.contacts.map((c) => parseInt(c._id.slice(1)))) + 1}`;
    const contact = { _id: id, ...data, createdAt: new Date().toISOString() };
    store.contacts.push(contact);
    return { success: true, contact };
  },
  update: async (id, data) => {
    await delay(300);
    const idx = store.contacts.findIndex((c) => c._id === id);
    if (idx === -1) throw { status: 404, message: "Contact not found" };
    store.contacts[idx] = { ...store.contacts[idx], ...data };
    return { success: true, contact: store.contacts[idx] };
  },
  remove: async (id) => {
    await delay(300);
    const idx = store.contacts.findIndex((c) => c._id === id);
    if (idx === -1) throw { status: 404, message: "Contact not found" };
    store.contacts.splice(idx, 1);
    return { success: true, message: "Contact deleted" };
  },
};

export const notesApi = {
  list: async (params) => {
    await delay(300);
    return { success: true, count: store.notes.length, notes: store.notes };
  },
  create: async (data) => {
    await delay(300);
    const id = `n${Math.max(...store.notes.map((n) => parseInt(n._id.slice(1))), 0) + 1}`;
    const note = { _id: id, ...data, createdAt: new Date().toISOString() };
    store.notes.push(note);
    return { success: true, note };
  },
  update: async (id, data) => {
    await delay(300);
    const idx = store.notes.findIndex((n) => n._id === id);
    if (idx === -1) throw { status: 404, message: "Note not found" };
    store.notes[idx] = { ...store.notes[idx], ...data };
    return { success: true, note: store.notes[idx] };
  },
  remove: async (id) => {
    await delay(300);
    const idx = store.notes.findIndex((n) => n._id === id);
    if (idx === -1) throw { status: 404, message: "Note not found" };
    store.notes.splice(idx, 1);
    return { success: true, message: "Note deleted" };
  },
};

export const tasksApi = {
  list: async (params) => {
    await delay(300);
    return { success: true, count: store.tasks.length, tasks: store.tasks };
  },
  create: async (data) => {
    await delay(300);
    const id = `t${Math.max(...store.tasks.map((t) => parseInt(t._id.slice(1)))) + 1}`;
    const task = { _id: id, ...data, createdAt: new Date().toISOString() };
    store.tasks.push(task);
    return { success: true, task };
  },
  update: async (id, data) => {
    await delay(300);
    const idx = store.tasks.findIndex((t) => t._id === id);
    if (idx === -1) throw { status: 404, message: "Task not found" };
    store.tasks[idx] = { ...store.tasks[idx], ...data };
    return { success: true, task: store.tasks[idx] };
  },
  remove: async (id) => {
    await delay(300);
    const idx = store.tasks.findIndex((t) => t._id === id);
    if (idx === -1) throw { status: 404, message: "Task not found" };
    store.tasks.splice(idx, 1);
    return { success: true, message: "Task deleted" };
  },
};

export const aiApi = {
  status: async () => {
    await delay(300);
    return mockAiStatus;
  },
  leadSummary: async (data) => {
    await delay(800);
    return mockAiSummary;
  },
  generateEmail: async (data) => {
    await delay(600);
    return mockAiEmail;
  },
  salesInsights: async (data) => {
    await delay(800);
    return mockAiInsights;
  },
  chat: async (data) => {
    await delay(500);
    return {
      success: true,
      reply:
        "Based on your leads and follow-ups, I'd recommend prioritizing the three stalled proposals in the Proposal stage. They represent high potential value and need attention.",
    };
  },
};

export const analyticsApi = {
  overview: async () => {
    await delay(400);
    const leads = store.leads;
    return {
      success: true,
      overview: {
        totalLeads: leads.length,
        totalValue: leads.reduce((sum, l) => sum + l.value, 0),
        pipelineByStage: {
          New: leads.filter((l) => l.status === "New").length,
          Qualified: leads.filter((l) => l.status === "Qualified").length,
          Proposal: leads.filter((l) => l.status === "Proposal").length,
          Won: leads.filter((l) => l.status === "Won").length,
          Lost: leads.filter((l) => l.status === "Lost").length,
        },
      },
    };
  },
};
