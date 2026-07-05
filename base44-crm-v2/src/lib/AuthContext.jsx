/**
 * AuthContext — the SINGLE auth provider.
 *
 * Fixes audit I-114: legacy had TWO AuthContexts (src/lib/AuthContext.jsx and
 * src/components/auth/AuthContext.jsx) with two `me()` calls and divergent user
 * shapes; the router and PermissionGuard read different ones. v2 has exactly one,
 * exposing `{ user, loading, error, refresh }`. Everything (RouteGuard, nav,
 * capability checks) reads from here.
 */
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Auth } from '@/api/entities';

const Ctx = createContext({ user: null, loading: true, error: null, refresh: () => {} });

export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, loading: true, error: null });

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const user = await Auth.me();
      setState({ user, loading: false, error: null });
    } catch (error) {
      setState({ user: null, loading: false, error });
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return <Ctx.Provider value={{ ...state, refresh }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
