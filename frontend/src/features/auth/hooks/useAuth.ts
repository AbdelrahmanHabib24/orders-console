import { useState, useEffect, useCallback } from 'react';
import { User } from '../types/auth';

export interface UseAuthReturn {
  user: User | null;
  authChecking: boolean;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  checkSession: () => Promise<void>;
  logout: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState<boolean>(true);

  // Session Hydration: Check /api/auth/me on initial load
  const checkSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user || null);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setAuthChecking(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // Clean logout handler
  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Continue client cleanup even if network fails
    } finally {
      setUser(null);
    }
  }, []);

  return {
    user,
    authChecking,
    setUser,
    checkSession,
    logout,
  };
}
