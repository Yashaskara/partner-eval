import { useState, useRef, useEffect } from 'react';
import { api } from '../api.js';
import { DOMAINS } from '../domains.js';

export default function DomainChat({ domain, onComplete, onClose }) {
  const domainInfo = DOMAINS.find(d => d.key === domain);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [summary, setSummary] = useState(null);
  const [saving, setSaving] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const started = useRef(false);

  useEffect(() => {
    if (!started.current) {
      started.current = true;
      kickoff();
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  async function kickoff() {
    setSending(true);
    try {
      const initMessages = [{ role: 'user', content: `I'd like to fill in my profile for the "${domainInfo.label}" domain. Ask me your first question.` }];
      const res = await api.selfProfile.chat(domain, initMessages);
      setMessages([{ role: 'assistant', content: cleanReply(res.message) }]);
      if (res.done && res.summary) setSummary(res.summary);
    } catch (e) {
      setMessages([{ role: 'assistant', content: 'Something went wrong starting the conversation. Please try again.' }]);
    }
    setSending(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  function cleanReply(text) {
    return text.replace(/---SUMMARY---[\s\S]*?---END---/, '').trim();
  }

  async function handleSend(e) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    const userMsg = { role: 'user', content: text };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');
    setSending(true);

    try {
      const apiMessages = [
        { role: 'user', content: `I'd like to fill in my profile for the "${domainInfo.label}" domain. Ask me your first question.` },
        ...updated,
      ];
      const res = await api.selfProfile.chat(domain, apiMessages);
      setMessages(prev => [...prev, { role: 'assistant', content: cleanReply(res.message) }]);
      if (res.done && res.summary) setSummary(res.summary);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong. You can try again or save what you have.' }]);
    }
    setSending(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  async function handleAcceptSummary() {
    setSaving(true);
    try {
      await api.selfProfile.updateDomain(domain, { answer: summary });
      onComplete(summary);
    } catch (e) {
      console.error(e);
      setSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog"
        onClick={e => e.stopPropagation()}
        style={{ width: 'min(620px, 95vw)', height: 'min(680px, 85vh)', padding: 0, display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid var(--color-divider)' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-accent)', marginBottom: 4 }}>Guided setup</div>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 22 }}>{domainInfo.label}</div>
          <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>{domainInfo.hint}</div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '82%',
                padding: '10px 14px',
                borderRadius: 'var(--radius-lg)',
                fontSize: 14,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                ...(m.role === 'user'
                  ? { background: 'var(--color-accent-100)', color: 'var(--color-accent-900)', borderBottomRightRadius: 2 }
                  : { background: 'var(--color-neutral-200)', borderBottomLeftRadius: 2 }),
              }}>
                {m.content}
              </div>
            </div>
          ))}

          {sending && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-lg)', background: 'var(--color-neutral-200)', fontSize: 14, color: 'var(--color-neutral-500)' }}>
                Thinking…
              </div>
            </div>
          )}

          {summary && (
            <div style={{ border: '1px solid var(--color-accent-300)', borderRadius: 'var(--radius-lg)', padding: '16px 18px', background: 'var(--color-accent-100)' }}>
              <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-accent-700)', marginBottom: 8, fontWeight: 600 }}>Summary</div>
              <p style={{ fontSize: 14, lineHeight: 1.7, margin: '0 0 14px', color: 'var(--color-accent-900)' }}>{summary}</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Discard</button>
                <button className="btn btn-primary" onClick={handleAcceptSummary} disabled={saving}>{saving ? 'Saving…' : 'Save to profile'}</button>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {!summary && (
          <form onSubmit={handleSend} style={{ padding: '12px 22px 18px', borderTop: '1px solid var(--color-divider)', display: 'flex', gap: 10 }}>
            <input
              ref={inputRef}
              className="input"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Type your answer…"
              disabled={sending}
              autoFocus
              style={{ flex: 1 }}
            />
            <button type="submit" className="btn btn-primary" disabled={sending || !input.trim()}>Send</button>
          </form>
        )}
      </div>
    </div>
  );
}
