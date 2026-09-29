"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { api, AuthResponse, setSessionRefresher } from "@/lib/api";

interface AuthContextValue {
  token: string | null;
  user: AuthResponse["user"] | null;
  isLoading: boolean;
  login: (auth: AuthResponse) => void;
  logout: (everywhere?: boolean) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = "ghepgo_auth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthResponse["user"] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshTokenRef = useRef<string | null>(null);
  const pendingRefresh = useRef<Promise<string | null> | null>(null);

  const persist = useCallback((auth: AuthResponse | null) => {
    try {
      if (auth) localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // storage unavailable (private mode): session lives in memory only
    }
  }, []);

  const clear = useCallback(() => {
    refreshTokenRef.current = null;
    setToken(null);
    setUser(null);
    persist(null);
  }, [persist]);

  // Exchange the refresh token for a new pair; concurrent 401s share one refresh.
  const refresh = useCallback((): Promise<string | null> => {
    if (pendingRefresh.current) return pendingRefresh.current;
    const rt = refreshTokenRef.current;
    if (!rt) return Promise.resolve(null);
    pendingRefresh.current = api
      .refresh(rt)
      .then((auth) => {
        refreshTokenRef.current = auth.refreshToken;
        setToken(auth.accessToken);
        setUser(auth.user);
        persist(auth);
        return auth.accessToken;
      })
      .catch(() => {
        clear();
        return null;
      })
      .finally(() => {
        pendingRefresh.current = null;
      });
    return pendingRefresh.current;
  }, [clear, persist]);

  useEffect(() => {
    setSessionRefresher(refresh);
    return () => setSessionRefresher(null);
  }, [refresh]);

  // Restore the session after hydration (deferred so no state is set synchronously in the effect).
  useEffect(() => {
    const id = setTimeout(() => {
      let raw: string | null = null;
      try {
        raw = localStorage.getItem(STORAGE_KEY);
      } catch {
        raw = null;
      }
      if (raw) {
        try {
          const parsed: AuthResponse = JSON.parse(raw);
          refreshTokenRef.current = parsed.refreshToken ?? null;
          setToken(parsed.accessToken);
          setUser(parsed.user);
        } catch {
          persist(null);
        }
      }
      setIsLoading(false);
    }, 0);
    return () => clearTimeout(id);
  }, [persist]);

  const login = useCallback(
    (auth: AuthResponse) => {
      refreshTokenRef.current = auth.refreshToken;
      setToken(auth.accessToken);
      setUser(auth.user);
      persist(auth);
    },
    [persist],
  );

  const logout = useCallback(
    async (everywhere = false) => {
      const t = token;
      const rt = refreshTokenRef.current ?? undefined;
      clear();
      if (t) await api.logout(t, rt, everywhere).catch(() => {});
    },
    [token, clear],
  );

  return <AuthContext.Provider value={{ token, user, isLoading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
