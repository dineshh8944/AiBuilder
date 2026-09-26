import api from "./api";

/*
  This file used to be pure in-memory mock data (see the old comment in
  api.js: "swap each method from the mock version back to the real
  api.<method>(...) call"). That swap never happened, so every page in the
  app was talking to a fake, in-browser data store and never once touched
  the Express/MongoDB backend - that's why nothing you did in the UI ever
  reached the database, and why the "connection" looked broken.

  Below, every method just calls the real backend through the axios
  instance in ./api.js (which already points at VITE_API_URL / the
  deployed Render backend and attaches the JWT). Response shapes match
  what backend/routes/*.js already returns, so no other file needs to
  change.
*/

export const authApi = {
  login: (data) => api.post("/auth/login", data),
  register: (data) => api.post("/auth/register", data),
  me: () => api.get("/auth/me"),
  updateProfile: (data) => api.put("/auth/profile", data),
};

export const leadsApi = {
  list: (params) => api.get("/leads", { params }),
  get: (id) => api.get(`/leads/${id}`),
  create: (data) => api.post("/leads", data),
  update: (id, data) => api.put(`/leads/${id}`, data),
  remove: (id) => api.delete(`/leads/${id}`),
  reorder: (updates) => api.patch("/leads/reorder", { updates }),
};

export const contactsApi = {
  list: (params) => api.get("/contacts", { params }),
  get: (id) => api.get(`/contacts/${id}`),
  create: (data) => api.post("/contacts", data),
  update: (id, data) => api.put(`/contacts/${id}`, data),
  remove: (id) => api.delete(`/contacts/${id}`),
};

export const notesApi = {
  list: (params) => api.get("/notes", { params }),
  create: (data) => api.post("/notes", data),
  update: (id, data) => api.put(`/notes/${id}`, data),
  remove: (id) => api.delete(`/notes/${id}`),
};

export const tasksApi = {
  list: (params) => api.get("/tasks", { params }),
  create: (data) => api.post("/tasks", data),
  update: (id, data) => api.put(`/tasks/${id}`, data),
  remove: (id) => api.delete(`/tasks/${id}`),
};

export const aiApi = {
  status: () => api.get("/ai/status"),
  leadSummary: (data) => api.post("/ai/lead-summary", data),
  generateEmail: (data) => api.post("/ai/generate-email", data),
  salesInsights: (data) => api.post("/ai/sales-insights", data),
  chat: (data) => api.post("/ai/chat", data),
};

export const analyticsApi = {
  overview: () => api.get("/analytics/overview"),
};
