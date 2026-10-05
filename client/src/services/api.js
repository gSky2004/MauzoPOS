import axios from 'axios';

const API_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

export { API_URL };

// Fired when a request 401s. AuthContext listens so a dead/expired token
// actually logs the user out in React state, not just in localStorage --
// otherwise ProtectedRoute keeps rendering a session that no longer exists.
export const AUTH_EXPIRED_EVENT = 'gsky:auth-expired';
const emitAuthExpired = () => {
  localStorage.removeItem('gsky_token');
  localStorage.removeItem('gsky_user');
  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
};

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('gsky_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => {
    if (API_URL && res.data && typeof res.data === 'object') {
      res.data = JSON.parse(JSON.stringify(res.data), (key, value) =>
        typeof value === 'string' && value.startsWith('/uploads/') ? `${API_URL}${value}` : value
      );
    }
    return res;
  },
  (err) => {
    const status = err.response?.status;
    const isLoginCall = (err.config?.url || '').includes('/auth/login');
    if (status === 401 && !isLoginCall) emitAuthExpired();
    // 403 means "logged in, but not allowed" (e.g. a shopkeeper opening an
    // admin route). Logging out there would be wrong, so only 401 triggers it.
    const message =
      err.response?.data?.message ||
      err.message ||
      'Something went wrong. Please try again.';
    return Promise.reject(new Error(message));
  }
);

export default api;
