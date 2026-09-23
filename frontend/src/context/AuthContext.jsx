import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { authApi } from "../lib/services";
import { TOKEN_KEY } from "../lib/api";

const AuthContext = createContext(null);

/**
 * Global auth provider. Persists the JWT in localStorage and restores the
 * session on refresh by calling /auth/me. Exposes login/register/logout.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // true until session is resolved

  // On mount, attempt to restore the session from a stored token.
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    // If no token, or it looks like the old hardcoded mock token, clear it.
    if (!token || token === "mock-token") {
      localStorage.removeItem(TOKEN_KEY);
      setLoading(false);
      return;
    }
    authApi
      .me()
      .then((res) => setUser(res.user))
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setLoading(false));
  }, []);

  // If any request comes back 401 (expired / invalid token), drop the session.
  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener("ttp:unauthorized", onUnauthorized);
    return () => window.removeEventListener("ttp:unauthorized", onUnauthorized);
  }, []);

  const persist = (res) => {
    localStorage.setItem(TOKEN_KEY, res.token);
    setUser(res.user);
    return res.user;
  };

  const login = useCallback(async (credentials) => {
    const res = await authApi.login(credentials);
    return persist(res);
  }, []);

  const register = useCallback(async (data) => {
    const res = await authApi.register(data);
    return persist(res);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  const updateUser = useCallback((patch) => {
    setUser((prev) => ({ ...prev, ...patch }));
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, updateUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
