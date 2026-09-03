'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  organization_id: string;
  display_name?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (
    email: string,
    password: string,
    name: string,
    organizationId?: string
  ) => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUser: (updates: Partial<User>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_STORAGE_KEY = 'auth_token';
const DEFAULT_ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

async function fetchCurrentUser(authToken: string): Promise<User | null> {
  const response = await fetch('/api/v1/auth/me', {
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  const result = await response.json();
  return result.user || null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const storedToken =
      typeof window !== 'undefined'
        ? localStorage.getItem(TOKEN_STORAGE_KEY)
        : null;

    if (!storedToken) {
      setLoading(false);
      return;
    }

    setToken(storedToken);

    fetchCurrentUser(storedToken)
      .then(userData => {
        if (userData) {
          setUser(userData);
        } else {
          localStorage.removeItem(TOKEN_STORAGE_KEY);
          setToken(null);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const response = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Login failed');
    }

    const maxAge = 7 * 24 * 60 * 60; // 7 days
    document.cookie = `auth_token=${data.token}; path=/; max-age=${maxAge}; SameSite=Lax`;
    localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
    setToken(data.token);
    setUser(data.user);
    router.push('/');
  }

  async function logout() {
    if (token) {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }).catch(() => null);
    }

    document.cookie =
      'auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setUser(null);
    router.push('/login');
  }

  async function register(
    email: string,
    password: string,
    name: string,
    organizationId?: string
  ) {
    const response = await fetch('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        name,
        organizationId: organizationId || DEFAULT_ORGANIZATION_ID,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Registration failed');
    }
  }

  async function refreshUser() {
    if (!token) {
      setUser(null);
      return;
    }

    const userData = await fetchCurrentUser(token);
    if (userData) {
      setUser(userData);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      setToken(null);
      setUser(null);
    }
  }

  async function updateUser(updates: Partial<User>) {
    if (!token || !user) {
      throw new Error('Not authenticated');
    }

    const response = await fetch('/api/v1/users', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        id: user.id,
        ...updates,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to update user');
    }

    const updatedUser = data.data?.user;

    if (updatedUser) {
      setUser({
        ...user,
        ...updatedUser,
      });
    } else {
      setUser({
        ...user,
        ...updates,
      });
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        logout,
        register,
        refreshUser,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
