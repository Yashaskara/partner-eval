import { useState } from 'react';
import { signIn } from '../lib/auth-client.js';
import RequestAccessForm from '../components/RequestAccessForm.jsx';

const isDev = import.meta.env.DEV;

export default function Login() {
  const [requesting, setRequesting] = useState(false);

  async function devLogin() {
    const email = 'dev@anvaya.local';
    const name = 'Dev User';
    await signIn.email({ email, name }, { onSuccess: () => window.location.reload() });
  }

  return (
    <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column', gap: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-accent)', marginBottom: 12 }}>Welcome to</div>
        <h1 style={{ fontWeight: 400, fontSize: 52, margin: '0 0 12px', fontFamily: 'var(--font-heading)' }}>Anvaya</h1>
        <p className="text-muted" style={{ fontSize: 14, lineHeight: 1.6, margin: '0 0 32px' }}>
          A private space to understand what you're looking for — and evaluate compatibility with clarity.
        </p>
        <button
          className="btn btn-primary"
          style={{ fontSize: 15, padding: '12px 32px' }}
          onClick={() => signIn.social({ provider: 'google', callbackURL: '/' })}
        >
          Sign in with Google
        </button>
        {isDev && (
          <button
            className="btn btn-secondary"
            style={{ fontSize: 13, padding: '10px 24px', marginTop: 12, display: 'block', marginInline: 'auto' }}
            onClick={devLogin}
          >
            Dev login (skip OAuth)
          </button>
        )}

        {!requesting ? (
          <>
            <p className="text-muted" style={{ fontSize: 12, marginTop: 20, marginBottom: 0 }}>
              Invite-only access.
            </p>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 12, marginTop: 6 }}
              onClick={() => setRequesting(true)}
            >
              Request access
            </button>
          </>
        ) : (
          <div style={{ marginTop: 26, textAlign: 'left' }}>
            <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-accent)', marginBottom: 8 }}>
              Request access
            </div>
            <RequestAccessForm
              intro={
                <p className="text-muted" style={{ fontSize: 12.5, lineHeight: 1.6, margin: '0 0 12px' }}>
                  Leave the email you'd sign in with — the admin will review it.
                </p>
              }
            />
            <button
              className="btn btn-ghost"
              style={{ fontSize: 12, marginTop: 10 }}
              onClick={() => setRequesting(false)}
            >
              Back to sign in
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
