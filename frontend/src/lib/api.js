import axios from "axios";

export const TOKEN_KEY = "ttp_crm_token";

// Vite injects VITE_API_URL at build time. The fallback keeps the deployed
// frontend connected even if the Render environment variable is omitted.
const baseURL = import.meta.env.VITE_API_URL || "https://aibuilder-5bt8.onrender.com/api";

const api = axios.create({ baseURL });

// Attach the JWT to every request if we have one.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Normalize responses and errors so callers get clean data/messages.
api.interceptors.response.use(
  (res) => res.data,
  (error) => {
    const status = error.response?.status;
    const message =
      error.response?.data?.message || error.message || "Something went wrong";

    // Auto-logout on an expired/invalid token (but not on the login screen).
    if (status === 401 && !window.location.pathname.startsWith("/login")) {
      localStorage.removeItem(TOKEN_KEY);
      window.dispatchEvent(new Event("ttp:unauthorized"));
    }

    return Promise.reject({ status, message });
  }
);

export default api;
