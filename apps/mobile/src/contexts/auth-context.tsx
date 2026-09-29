import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, setSessionRefresher } from "../lib/api";

type Role = "CUSTOMER" | "DRIVER" | "ADMIN";

interface AuthUser {
  id: string;
  phone: string;
  role: Role;
  fullName: string;
}

interface AuthState {
  token: string;
  refreshToken?: string;
  user: AuthUser;
}

interface AuthContextValue {
  token: string | null;
  user: AuthUser | null;
  isLoading: boolean;
  login: (auth: AuthState) => void;
  logout: () => Promise<void>;
}

const STORAGE_KEY = "ghepgo_driver_auth";

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshTokenRef = useRef<string | null>(null);
  const pending = useRef<Promise<string | null> | null>(null);

  const clear = useCallback(() => {
    refreshTokenRef.current = null;
    setToken(null);
    setUser(null);
    AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  const refresh = useCallback((): Promise<string | null> => {
    if (pending.current) return pending.current;
    const rt = refreshTokenRef.current;
    if (!rt) return Promise.resolve(null);
    pending.current = api
      .refresh(rt)
      .then((auth) => {
        refreshTokenRef.current = auth.refreshToken;
        setToken(auth.accessToken);
        setUser(auth.user);
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ token: auth.accessToken, refreshToken: auth.refreshToken, user: auth.user }));
        return auth.accessToken as string;
      })
      .catch(() => {
        clear();
        return null;
      })
      .finally(() => {
        pending.current = null;
      });
    return pending.current;
  }, [clear]);

  useEffect(() => {
    setSessionRefresher(refresh);
    return () => setSessionRefresher(null);
  }, [refresh]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          const parsed: AuthState = JSON.parse(raw);
          refreshTokenRef.current = parsed.refreshToken ?? null;
          setToken(parsed.token);
          setUser(parsed.user);
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback((auth: AuthState) => {
    refreshTokenRef.current = auth.refreshToken ?? null;
    setToken(auth.token);
    setUser(auth.user);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
  }, []);

  const logout = useCallback(async () => {
    const t = token;
    const rt = refreshTokenRef.current ?? undefined;
    clear();
    if (t) await api.logout(t, rt).catch(() => {});
  }, [token, clear]);

  return (
    <AuthContext.Provider value={{ token, user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
