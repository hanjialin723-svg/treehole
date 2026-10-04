import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { request } from '../../diaryApi.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);
export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, loading: true, error: '' });
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const version = ++generation.current;
    try {
      const result = await request('/auth/session');
      if (version === generation.current) setState({ user: result.user, loading: false, error: '' });
    } catch (error) {
      if (version === generation.current) setState((previous) => ({ ...previous, loading: false, error: error.message }));
    }
  }, []);
  useEffect(() => {
    refresh();
    const expire = () => { generation.current++; setState({ user: null, loading: false, error: '' }); };
    const focus = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('treehole-session-expired', expire);
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', focus);
    return () => {
      generation.current++;
      window.removeEventListener('treehole-session-expired', expire);
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', focus);
    };
  }, [refresh]);
  async function action(path, body, method = 'POST') {
    generation.current++;
    const result = await request(path, { method, body });
    generation.current++;
    setState({ user: result.user || null, loading: false, error: '' });
    return result;
  }
  return <AuthContext.Provider value={{ ...state, refresh,
    login: (body) => action('/auth/login', body), register: (body) => action('/auth/register', body),
    updateAccount: (body) => action('/auth/account', body, 'PUT'), logout: () => action('/auth/logout', {}),
  }}>{children}</AuthContext.Provider>;
}
