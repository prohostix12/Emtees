import { useState, useEffect, createContext, useContext, type ReactNode } from "react";
import { trpc } from "@/providers/trpc";

interface AuthUser {
  id: number;
  name: string;
  role: string;
  phone: string | null;
  username?: string | null;
  status?: string;
  unionId?: string;
  email?: string | null;
  notificationsPausedUntil?: Date | string | null;
  mustChangePassword?: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (data: { token: string; user: AuthUser }) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem("token"));
  const [isLoading, setIsLoading] = useState(true);
  const meQuery = trpc.auth.me.useQuery(undefined, { enabled: !!token });

  useEffect(() => {
    if (meQuery.data) {
      setUser(meQuery.data);
      setIsLoading(false);
    } else if (meQuery.isError) {
      setUser(null);
      setIsLoading(false);
    } else if (!token) {
      setIsLoading(false);
    }
  }, [meQuery.data, meQuery.isError, token]);

  const login = (data: { token: string; user: AuthUser }) => {
    localStorage.setItem("token", data.token);
    setToken(data.token);
    setUser(data.user);
  };

  const logout = () => {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
    window.location.href = "/login";
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
