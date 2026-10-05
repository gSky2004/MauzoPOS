import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { auth } from '../services/gskyApi';
import { AUTH_EXPIRED_EVENT } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('gsky_user') || 'null');
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem('gsky_token') || null);
  const [loading, setLoading] = useState(!!localStorage.getItem('gsky_token'));

  useEffect(() => {
    if (!token) return;
    auth
      .me()
      .then(({ user }) => {
        setUser(user);
        localStorage.setItem('gsky_user', JSON.stringify(user));
      })
      .catch(() => {
        setUser(null);
        setToken(null);
        localStorage.removeItem('gsky_token');
        localStorage.removeItem('gsky_user');
      })
      .finally(() => setLoading(false));
  }, [token]);

  // A 401 anywhere in the app (expired or revoked token) must clear React state
  // too, otherwise the UI keeps a "logged in" session whose every request 401s.
  useEffect(() => {
    const onExpired = () => {
      setUser(null);
      setToken(null);
      setLoading(false);
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await auth.login({ email, password });
    localStorage.setItem('gsky_token', data.token);
    localStorage.setItem('gsky_user', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await auth.logout();
    } catch {
      /* token already invalid */
    }
    localStorage.removeItem('gsky_token');
    localStorage.removeItem('gsky_user');
    setUser(null);
    setToken(null);
  }, []);

  const value = { user, token, loading, login, logout, setUser };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
