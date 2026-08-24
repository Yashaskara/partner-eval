import { useState } from 'react';
import { api } from '../api.js';

export default function RequestAccessForm({ defaultEmail = '', lockEmail = false, intro = null, onSubmitted }) {
  const [email, setEmail] = useState(defaultEmail);
  const [note, setNote] = useState('');
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await api.accessRequests.submit({ email: email.trim(), note: note.trim() });
      setStatus(res);
      onSubmitted?.(res);
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  }

  if (status) {
    return (
      <p className="text-muted" style={{ fontSize: 13, lineHeight: 1.6, margin: 0 }}>
        {status.alreadyAllowed
          ? 'This email already has access — try signing in.'
          : status.alreadyRequested
            ? 'A request for this email is already pending review.'
            : 'Request received. The admin will review it and you’ll be able to sign in once approved.'}
      </p>
    );
  }

  return (
    <>
      {intro}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left' }}>
        <input
          className="input"
          type="email"
          required
          value={email}
          disabled={lockEmail}
          onChange={e => setEmail(e.target.value)}
          placeholder="email@example.com"
        />
        <textarea
          className="input"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Anything the admin should know (optional)"
          maxLength={500}
          style={{ minHeight: 70 }}
        />
        {error && <div style={{ fontSize: 12, color: '#9b2c2c' }}>{error}</div>}
        <button className="btn btn-primary" type="submit" disabled={saving || !email.trim()}>
          {saving ? 'Sending…' : 'Send request'}
        </button>
      </form>
    </>
  );
}
