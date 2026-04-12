import { createContext, useContext, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useGetMe, getGetMeQueryKey, setAuthTokenGetter } from "@workspace/api-client-react";
import type { AuthUser } from "@workspace/api-client-react/src/generated/api.schemas";
import { useQueryClient } from "@tanstack/react-query";

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  updateUser: (user: AuthUser) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem("token"));
  const [user, setUser] = useState<AuthUser | null>(
    localStorage.getItem("user") ? JSON.parse(localStorage.getItem("user")!) : null
  );
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  // Wire up the global auth token getter so ALL API hooks automatically send Authorization header
  useEffect(() => {
    setAuthTokenGetter(() => localStorage.getItem("token"));
    return () => {
      setAuthTokenGetter(null);
    };
  }, []);

  const { data: meData, isLoading, error } = useGetMe({
    query: {
      enabled: !!token,
      queryKey: getGetMeQueryKey(),
      retry: false,
    },
  });

  useEffect(() => {
    if (error) {
      handleLogout();
    } else if (meData) {
      setUser(meData.user);
      localStorage.setItem("user", JSON.stringify(meData.user));
    }
  }, [meData, error]);

  const handleLogin = (newToken: string, newUser: AuthUser) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem("token", newToken);
    localStorage.setItem("user", JSON.stringify(newUser));
    // Update the global getter immediately
    setAuthTokenGetter(() => newToken);
    queryClient.setQueryData(getGetMeQueryKey(), { user: newUser, token: newToken });
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setAuthTokenGetter(null);
    queryClient.removeQueries({ queryKey: getGetMeQueryKey() });
    setLocation("/login");
  };

  const updateUser = (updatedUser: AuthUser) => {
    setUser(updatedUser);
    localStorage.setItem("user", JSON.stringify(updatedUser));
    queryClient.setQueryData(getGetMeQueryKey(), { user: updatedUser, token });
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login: handleLogin, logout: handleLogout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
