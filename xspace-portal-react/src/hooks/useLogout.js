import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { setToken } from '../lib/api';
import { KEYS, removeRaw } from '../lib/storage';

export function useLogout() {
  const navigate = useNavigate();
  return useCallback(async () => {
    /* Sign off first, while the token is still valid — otherwise the account
       keeps reading as online until the presence window lapses. */
    await api.auth.goOffline();
    setToken(null);
    removeRaw(KEYS.auth);
    removeRaw(KEYS.role);
    removeRaw(KEYS.userId);
    navigate('/login', { replace: true });
  }, [navigate]);
}
