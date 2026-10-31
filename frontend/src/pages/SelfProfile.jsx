import { useState, useEffect } from 'react';
import { api } from '../api.js';
import { DOMAINS, PRIORITY_WORD } from '../domains.js';
import DomainMark from '../components/DomainMark.jsx';
import Dialog from '../components/Dialog.jsx';
import DomainQA from '../components/DomainQA.jsx';
import ProfileConversation from '../components/ProfileConversation.jsx';
import { useToast } from '../components/Toast.jsx';

export default function SelfProfile() {
  const [tab, setTab] = useState('profile');
  const [profile, setProfile] = useState(null);
  const [prepQuestions, setPrepQuestions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const [profileData, prepData] = await Promise.all([
        api.selfProfile.get(),
        api.prepQuestions.list(),
      ]);
      setProfile(profileData);
      setPrepQuestions(prepData);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  if (loading) return <div className="page page-narrow" style={{ paddingTop: 120, textAlign: 'center' }}>Loading…</div>;

  const domainMap = {};
  for (const d of (profile?.domains || [])) domainMap[d.domain] = d;
  const filledCount = (profile?.domains || []).filter(d => d.answer.trim()).length;
  const p1Count = (profile?.domains || []).filter(d => d.priority === 1).length;

  return (
    <div className="page page-narrow">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 30 }}>
        <div style={{ maxWidth: 620 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-accent)', marginBottom: 10 }}>Your profile</div>
          <h1 style={{ fontWeight: 400, fontSize: 46, margin: '0 0 10px' }}>What you're actually looking for</h1>
          <p className="text-muted" style={{ fontSize: 14, margin: 0 }}>
            Everything downstream leans on this. The priorities you set here decide how heavily each domain counts when a partner is scored — so it's worth being honest rather than generous.
          </p>
        </div>
        <div className="seg" style={{ flex: 'none' }}>
          <button className={`seg-opt${tab === 'profile' ? ' active' : ''}`} onClick={() => setTab('profile')}>Your answers</button>
          <button className={`seg-opt${tab === 'prep' ? ' active' : ''}`} onClick={() => setTab('prep')}>Prep questions</button>
        </div>
      </div>
      <hr className="hr" style={{ margin: '30px 0 22px' }} />

      {tab === 'profile' ? (
        <ProfileTab domainMap={domainMap} profile={profile} filledCount={filledCount} p1Count={p1Count} onSaved={load} />
      ) : (
        <PrepTab questions={prepQuestions} onRegenerated={load} />
      )}
    </div>
  );
}

function ProfileTab({ domainMap, profile, filledCount, p1Count, onSaved }) {
  const [editing, setEditing] = useState(null);
  const [qaDomain, setQaDomain] = useState(null);
  const [showConversation, setShowConversation] = useState(false);
  const [progress, setProgress] = useState(null);

  useEffect(() => { loadProgress(); }, []);

  async function loadProgress() {
    try {
      const data = await api.profileQA.getProgress();
      setProgress(data);
    } catch (e) { console.error(e); }
  }

  function startGuidedSetup() {
    const unfilled = DOMAINS.find(d => {
      const p = progress?.[d.key];
      return !p || p.answered < p.total;
    });
    setQaDomain(unfilled ? unfilled.key : DOMAINS[0].key);
  }

  function domainProgress(key) {
    const p = progress?.[key];
    if (!p) return null;
    return p;
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22, flexWrap: 'wrap' }}>
        <span className="text-muted" style={{ fontSize: 12.5 }}>
          Twelve domains · {p1Count} at first priority · {filledCount} filled
          {profile?.updated_at && ` · last edited ${new Date(profile.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}`}
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 10, flex: 'none' }}>
          <button className="btn btn-secondary" onClick={() => setShowConversation(true)} disabled={filledCount === 0}>
            Refine via conversation
          </button>
          <button className="btn btn-primary" onClick={startGuidedSetup}>
            Guided setup
          </button>
        </span>
      </div>

      <div style={{ borderTop: '1px solid var(--color-divider)' }}>
        {DOMAINS.map(d => {
          const data = domainMap[d.key] || { answer: '', priority: 2 };
          const dp = domainProgress(d.key);
          const pct = dp ? Math.round((dp.answered / dp.total) * 100) : 0;

          return (
            <div key={d.key} className="k-row" style={{ display: 'grid', gridTemplateColumns: '200px 1fr 230px', gap: 30, padding: '20px 10px', borderBottom: '1px solid var(--color-divider)', alignItems: 'start' }}>
              <div style={{ cursor: 'pointer' }} onClick={() => setEditing(d.key)}>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 18 }}>{d.label}</div>
                <div className="text-muted" style={{ fontSize: 11, marginTop: 3 }}>{d.hint}</div>
                {dp && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ height: 3, background: 'var(--color-divider)', borderRadius: 2, width: 80 }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? 'var(--color-accent)' : 'var(--color-neutral-400)', borderRadius: 2, transition: 'width 0.3s' }} />
                    </div>
                    <span className="text-muted" style={{ fontSize: 10, marginTop: 2, display: 'block' }}>{dp.answered}/{dp.total} questions</span>
                  </div>
                )}
              </div>
              <div style={{ cursor: 'pointer' }} onClick={() => setEditing(d.key)}>
                <p style={{ fontSize: 13.5, lineHeight: 1.65, margin: 0, color: data.answer ? 'inherit' : 'var(--color-neutral-400)' }}>
                  {data.answer || 'Not filled in yet — click to edit'}
                </p>
                <button className="btn btn-ghost" style={{ marginTop: 6, fontSize: 12, padding: '2px 6px' }} onClick={e => { e.stopPropagation(); setQaDomain(d.key); }}>
                  Answer questions
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
                <span className="text-muted" style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: 'right' }}>{PRIORITY_WORD[data.priority]}</span>
                <div className="seg" style={{ flex: 'none' }}>
                  {[1, 2, 3].map(p => (
                    <button
                      key={p}
                      className={`seg-opt${data.priority === p ? ' active' : ''}`}
                      onClick={async (e) => {
                        e.stopPropagation();
                        await api.selfProfile.updateDomain(d.key, { priority: p });
                        onSaved();
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <EditDomainDialog
          domain={editing}
          domainLabel={DOMAINS.find(d => d.key === editing)?.label}
          current={domainMap[editing] || { answer: '', priority: 2 }}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onSaved(); }}
        />
      )}

      {qaDomain && (
        <DomainQA
          domain={qaDomain}
          onClose={() => setQaDomain(null)}
          onComplete={() => { setQaDomain(null); loadProgress(); onSaved(); }}
        />
      )}

      {showConversation && (
        <ProfileConversation
          onClose={() => setShowConversation(false)}
          onUpdated={() => { setShowConversation(false); onSaved(); }}
        />
      )}
    </div>
  );
}

function EditDomainDialog({ domain, domainLabel, current, onClose, onSaved }) {
  const [answer, setAnswer] = useState(current.answer);
  const [priority, setPriority] = useState(current.priority);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await api.selfProfile.updateDomain(domain, { answer, priority });
      onSaved();
    } catch (e) { console.error(e); setSaving(false); }
  }

  return (
    <Dialog
      title={domainLabel}
      onClose={onClose}
      actions={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      <div className="field" style={{ marginBottom: 16 }}>
        <label>Your answer</label>
        <textarea className="input" rows={5} value={answer} onChange={e => setAnswer(e.target.value)} autoFocus placeholder="What matters to you in this domain…" />
      </div>
      <div className="field">
        <label>Priority</label>
        <div className="seg">
          {[1, 2, 3].map(p => (
            <button key={p} className={`seg-opt${priority === p ? ' active' : ''}`} onClick={() => setPriority(p)}>
              {p} — {PRIORITY_WORD[p]}
            </button>
          ))}
        </div>
      </div>
    </Dialog>
  );
}

function PrepTab({ questions, onRegenerated }) {
  const toast = useToast();
  const [generating, setGenerating] = useState(false);

  async function handleRegenerate() {
    setGenerating(true);
    try {
      await api.prepQuestions.generate();
      onRegenerated();
    } catch (e) { toast('Generation failed: ' + e.message); }
    setGenerating(false);
  }

  const guideConfig = [
    { key: 'guide_aligned', label: 'Reassuring', state: 'aligned', edge: 'var(--color-accent-600)' },
    { key: 'guide_watch', label: 'Slow down', state: 'watch', edge: 'var(--color-accent-300)' },
    { key: 'guide_flag', label: 'Take seriously', state: 'flag', edge: 'var(--color-neutral-400)' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 26, flexWrap: 'wrap' }}>
        <span className="text-muted" style={{ fontSize: 12.5, maxWidth: 620 }}>
          Generated from your profile — ordered by your own priorities, with what a reassuring answer sounds like versus one worth slowing down for. Take four or five, not all of them.
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 10, flex: 'none' }}>
          <button className="btn btn-secondary" onClick={handleRegenerate} disabled={generating}>
            {generating ? 'Generating…' : '↻ Regenerate'}
          </button>
        </span>
      </div>

      {questions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-md)' }}>
          <h3 style={{ fontWeight: 400, margin: '0 0 8px' }}>No prep questions yet</h3>
          <p className="text-muted" style={{ fontSize: 14, marginBottom: 16 }}>Fill in your self-profile, then generate questions calibrated to what you care about.</p>
          <button className="btn btn-primary" onClick={handleRegenerate} disabled={generating}>
            {generating ? 'Generating…' : 'Generate prep questions'}
          </button>
        </div>
      ) : (
        questions.map((q, i) => (
          <div key={q.id} style={{ borderTop: '1px solid var(--color-divider)', padding: '24px 0' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 4 }}>
              <span className="num" style={{ fontFamily: 'var(--font-heading)', fontSize: 22, color: 'var(--color-neutral-400)' }}>{String(i + 1).padStart(2, '0')}</span>
              <div>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 20, lineHeight: 1.25 }}>{q.question}</div>
                <div className="text-muted" style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 5 }}>
                  {DOMAINS.find(d => d.key === q.domain)?.label || q.domain} · priority {q.priority}
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, margin: '16px 0 0 36px' }}>
              {guideConfig.map(g => (
                <div key={g.key} style={{ borderTop: `2px solid ${g.edge}`, paddingTop: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                    <DomainMark state={g.state} size="sm" />
                    <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{g.label}</span>
                  </div>
                  <p className="text-muted" style={{ fontSize: 12.5, lineHeight: 1.6, margin: 0 }}>{q[g.key]}</p>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
