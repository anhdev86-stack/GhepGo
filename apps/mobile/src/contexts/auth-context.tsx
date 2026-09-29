import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Role = "CUSTOMER" | "DRIVER" | "ADMIN";

interface AuthUser {
  id: string;
  phone: string;
  role: Role;
  fullName: string;
}

interface AuthState {
  token: string;
  user: AuthUser;
}

interface AuthContextValue {
  token: string | null;
  user: AuthUser | null;
  isLoading: boolean;
  login: (auth: AuthState) => void;
  logout: () => void;
}

const STORAGE_KEY = "ghepgo_driver_auth";

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          const parsed: AuthState = JSON.parse(raw);
          setToken(parsed.token);
          setUser(parsed.user);
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = (auth: AuthState) => {
    setToken(auth.token);
    setUser(auth.user);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    AsyncStorage.removeItem(STORAGE_KEY);
  };

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
