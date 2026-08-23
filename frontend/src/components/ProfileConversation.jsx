import { useState, useEffect, useRef } from 'react';
import { api } from '../api.js';
import { DOMAINS } from '../domains.js';

export default function ProfileConversation({ onUpdated, onClose }) {
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [proposedUpdates, setProposedUpdates] = useState(null);
  const [applying, setApplying] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  useEffect(() => {
    startConversation();
  }, []);

  async function startConversation() {
    try {
      const { id } = await api.conversations.create({});
      setConversationId(id);
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleSend(e) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || sending || !conversationId) return;

    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setInput('');
    setSending(true);

    try {
      const reply = await api.conversations.sendMessage(conversationId, text);
      setMessages(prev => [...prev, reply]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong. Try again.' }]);
    }
    setSending(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  async function handleUpdatePreferences() {
    if (!conversationId || messages.length < 2) return;
    setClassifying(true);

    try {
      const classified = await api.conversations.classify(conversationId);
      if (!classified.domains || classified.domains.length === 0) {
        setProposedUpdates({ empty: true, reasoning: classified.reasoning || 'No meaningful preference changes detected in this conversation.' });
        setClassifying(false);
        return;
      }

      const updates = await api.conversations.updatePreferences(conversationId, classified.domains);
      setProposedUpdates(updates);
    } catch (e) {
      console.error(e);
      alert('Failed to analyze conversation: ' + e.message);
    }
    setClassifying(false);
  }

  async function handleApplyUpdates(selectedUpdates) {
    setApplying(true);
    try {
      await api.conversations.applyUpdates(conversationId, selectedUpdates);
      onUpdated();
    } catch (e) {
      console.error(e);
      setApplying(false);
    }
  }

  const domainLabel = (key) => DOMAINS.find(d => d.key === key)?.label || key;

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog"
        onClick={e => e.stopPropagation()}
        style={{ width: 'min(640px, 95vw)', height: 'min(700px, 88vh)', padding: 0, display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid var(--color-divider)', flex: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-accent)', marginBottom: 4 }}>Free conversation</div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 22 }}>Refine your profile</div>
            <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>Talk through what's on your mind. Update your profile when you're ready.</div>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {messages.length === 0 && !sending && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-neutral-500)' }}>
              <p style={{ fontSize: 14, margin: 0 }}>Start a conversation about anything on your mind — what you're rethinking, what's become clearer, or what's changed.</p>
            </div>
          )}

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
                Thinking...
              </div>
            </div>
          )}

          {/* Proposed updates */}
          {proposedUpdates && (
            <UpdateProposalCard
              proposedUpdates={proposedUpdates}
              applying={applying}
              onApply={handleApplyUpdates}
              onDismiss={() => setProposedUpdates(null)}
              domainLabel={domainLabel}
            />
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ padding: '12px 22px 18px', borderTop: '1px solid var(--color-divider)', flex: 'none' }}>
          <form onSubmit={handleSend} style={{ display: 'flex', gap: 10 }}>
            <input
              ref={inputRef}
              className="input"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="What's on your mind..."
              disabled={sending || classifying}
              autoFocus
              style={{ flex: 1 }}
            />
            <button type="submit" className="btn btn-secondary" disabled={sending || !input.trim()}>Send</button>
          </form>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button
              className="btn btn-primary"
              onClick={handleUpdatePreferences}
              disabled={classifying || messages.length < 2 || !!proposedUpdates}
            >
              {classifying ? 'Analyzing...' : 'Update preferences'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function UpdateProposalCard({ proposedUpdates, applying, onApply, onDismiss, domainLabel }) {
  const [accepted, setAccepted] = useState({});

  if (proposedUpdates.empty) {
    return (
      <div style={{ border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-lg)', padding: '16px 18px' }}>
        <div style={{ fontSize: 13, color: 'var(--color-neutral-600)' }}>{proposedUpdates.reasoning}</div>
        <button className="btn btn-secondary" style={{ marginTop: 10 }} onClick={onDismiss}>Got it</button>
      </div>
    );
  }

  const updates = proposedUpdates.updates || [];
  const selectedUpdates = updates.filter((_, i) => accepted[i] !== false);

  return (
    <div style={{ border: '1px solid var(--color-accent-300)', borderRadius: 'var(--radius-lg)', padding: '18px 20px', background: 'var(--color-accent-100)' }}>
      <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-accent-700)', marginBottom: 12, fontWeight: 600 }}>
        Proposed profile updates
      </div>

      {updates.map((u, i) => (
        <div key={i} style={{ borderTop: i > 0 ? '1px solid var(--color-accent-300)' : 'none', paddingTop: i > 0 ? 14 : 0, marginTop: i > 0 ? 14 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 16 }}>{domainLabel(u.domain)}</span>
            <button
              className={`btn ${accepted[i] === false ? 'btn-secondary' : 'btn-ghost'}`}
              style={{ fontSize: 11, padding: '2px 8px' }}
              onClick={() => setAccepted(prev => ({ ...prev, [i]: prev[i] === false ? undefined : false }))}
            >
              {accepted[i] === false ? 'Skipped' : 'Skip'}
            </button>
          </div>
          {accepted[i] !== false && (
            <>
              <div style={{ fontSize: 12, color: 'var(--color-neutral-600)', marginBottom: 4 }}>Was:</div>
              <p style={{ fontSize: 13, margin: '0 0 8px', color: 'var(--color-accent-800)', opacity: 0.7, fontStyle: 'italic' }}>
                {u.old_summary || 'Empty'}
              </p>
              <div style={{ fontSize: 12, color: 'var(--color-neutral-600)', marginBottom: 4 }}>Now:</div>
              <p style={{ fontSize: 13, margin: '0 0 6px', color: 'var(--color-accent-900)' }}>
                {u.new_summary}
              </p>
              <p className="text-muted" style={{ fontSize: 11.5, margin: 0 }}>{u.change_reason}</p>
            </>
          )}
        </div>
      ))}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn btn-secondary" onClick={onDismiss} disabled={applying}>Discard all</button>
        <button
          className="btn btn-primary"
          onClick={() => onApply(selectedUpdates)}
          disabled={applying || selectedUpdates.length === 0}
        >
          {applying ? 'Applying...' : `Apply ${selectedUpdates.length} update${selectedUpdates.length === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  );
}
