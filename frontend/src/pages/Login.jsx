import { signIn } from '../lib/auth-client.js';

export default function Login() {
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
        <p className="text-muted" style={{ fontSize: 12, marginTop: 20 }}>
          Invite-only access. Contact the admin if you need an account.
        </p>
      </div>
    </div>
  );
}
