import { useState } from 'react';
import { signOut } from '../lib/auth-client.js';
import RequestAccessForm from '../components/RequestAccessForm.jsx';

export default function AccessPending({ user, request, onRequested }) {
  const [submitted, setSubmitted] = useState(false);
  const pending = request?.status === 'pending' || submitted;

  return (
    <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column' }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-accent)', marginBottom: 12 }}>
          {pending ? 'Request pending' : 'Access needed'}
        </div>
        <h1 style={{ fontWeight: 400, fontSize: 42, margin: '0 0 12px', fontFamily: 'var(--font-heading)' }}>
          {pending ? 'You’re on the list' : 'Anvaya is invite-only'}
        </h1>
        <p className="text-muted" style={{ fontSize: 14, lineHeight: 1.6, margin: '0 0 8px' }}>
          {pending
            ? 'Your request is waiting for the admin to review it. You’ll get in as soon as it’s approved — just sign in again.'
            : 'Signed in as the address below, but it hasn’t been given access yet. Send a request and the admin will review it.'}
        </p>
        <p style={{ fontSize: 13.5, fontWeight: 500, margin: '0 0 26px' }}>{user?.email}</p>

        {!pending && (
          <RequestAccessForm
            defaultEmail={user?.email || ''}
            lockEmail
            onSubmitted={() => { setSubmitted(true); onRequested?.(); }}
          />
        )}

        <button
          className="btn btn-ghost"
          style={{ fontSize: 12, marginTop: 16 }}
          onClick={() => signOut({ fetchOptions: { credentials: 'include' } })}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
