import { useState, useEffect } from 'react';

export function useSession() {
  const [data, setData] = useState(null);
  const [isPending, setIsPending] = useState(true);

  useEffect(() => {
    fetch('/api/auth/session', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        setData(d.user ? { user: d.user } : null);
        setIsPending(false);
      })
      .catch(() => setIsPending(false));
  }, []);

  return { data, isPending };
}

export const signIn = {
  social({ provider, callbackURL }) {
    window.location.href = `/api/auth/${provider}/login?callbackURL=${encodeURIComponent(callbackURL || '/')}`;
  },
  async email({ email, password }, { onSuccess } = {}) {
    await fetch('/api/auth/dev-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    onSuccess?.();
  },
};

export function signOut({ fetchOptions } = {}) {
  return fetch('/api/auth/signout', { method: 'POST', credentials: 'include', ...fetchOptions })
    .then(() => { window.location.href = '/login'; });
}
