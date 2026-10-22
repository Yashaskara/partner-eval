import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import { DOMAINS, STATUS_LABEL, stateOf, stateLabel, scoreColor, weight } from '../domains.js';
import DomainStrip from '../components/DomainStrip.jsx';
import DomainMark from '../components/DomainMark.jsx';
import Dialog from '../components/Dialog.jsx';

export default function PartnerDetail() {
  const { id } = useParams();
  const [partner, setPartner] = useState(null);
  const [editing, setEditing] = useState(null);
  const [noteType, setNoteType] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingDomains, setEditingDomains] = useState(false);

  useEffect(() => { load(); }, [id]);

  async function load() {
    try {
      const data = await api.partners.get(id);
      setPartner(data);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function handleAnalyze() {
    setAnalyzing(true);
    try {
      await api.analysis.run(id);
      await load();
    } catch (e) { alert('Analysis failed: ' + e.message); }
    setAnalyzing(false);
  }

  if (loading) return <div className="page" style={{ paddingTop: 120, textAlign: 'center' }}>Loading…</div>;
  if (!partner) return <div className="page"><p>Partner not found.</p></div>;

  const latestRun = partner.runs?.[0];
  const assessments = partner.assessments || [];
  const scoreMap = {};
  for (const a of assessments) scoreMap[a.domain] = a;

  const composite = latestRun?.composite_score;
  const positives = (partner.notes || []).filter(n => n.type === 'positive');
  const negatives = (partner.notes || []).filter(n => n.type === 'negative');

  const domainMap = {};
  for (const d of (partner.domains || [])) domainMap[d.domain] = d.answer;
  const showForm = editingDomains || assessments.length === 0;

  return (
    <div className="page">
      <Link to="/" style={{ fontSize: 12.5, textDecoration: 'none' }}>← Roster</Link>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 40, marginTop: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span className="tag tag-neutral">{STATUS_LABEL[partner.status]}</span>
            {partner.stale && <span className="tag tag-accent">score is stale</span>}
          </div>
          <h1 style={{ fontWeight: 400, fontSize: 52, margin: '0 0 8px' }}>{partner.name}</h1>
          <div className="text-muted" style={{ fontSize: 13.5 }}>{partner.source}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 34, flex: 'none' }}>
          {composite != null && (
            <div style={{ textAlign: 'right' }}>
              <div className="num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, fontSize: 76, lineHeight: 0.9, color: scoreColor(composite) }}>{composite.toFixed(1)}</div>
              <div className="text-muted" style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 6 }}>weighted · out of 10</div>
            </div>
          )}
          <button className="btn btn-primary" onClick={handleAnalyze} disabled={analyzing}>
            {analyzing ? 'Analysing…' : '↻ Recompute'}
          </button>
          <button className="btn btn-secondary" onClick={() => setEditing(partner)}>Edit</button>
        </div>
      </div>

      {partner.stale && (
        <div className="stale-banner" style={{ marginTop: 24 }}>
          {partner.stale_reason === 'partner'
            ? `This read was written before you last updated what you know about ${partner.name} — recompute to fold the new information in.`
            : 'This read was written before you changed your own profile — the number below still uses the old weighting.'}
        </div>
      )}

      <hr className="hr" style={{ margin: '28px 0 0' }} />

      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 48, paddingTop: 30 }}>
        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
          <div>
            <h6 style={{ margin: '0 0 12px', color: 'color-mix(in srgb, var(--color-text) 55%, transparent)' }}>At a glance</h6>
            <DomainStrip assessments={assessments} />
          </div>

          <div>
            <h6 style={{ margin: '0 0 10px', color: 'color-mix(in srgb, var(--color-text) 55%, transparent)' }}>What you liked</h6>
            {positives.map(n => (
              <div key={n.id} style={{ display: 'flex', gap: 10, fontSize: 13, padding: '7px 0', borderBottom: '1px solid var(--color-divider)' }}>
                <span style={{ color: 'var(--color-accent)', flex: 'none' }}>＋</span><span>{n.text}</span>
              </div>
            ))}
            {positives.length === 0 && <p className="text-muted" style={{ fontSize: 13 }}>None yet</p>}
          </div>

          <div>
            <h6 style={{ margin: '0 0 10px', color: 'color-mix(in srgb, var(--color-text) 55%, transparent)' }}>What gave you pause</h6>
            {negatives.map(n => (
              <div key={n.id} style={{ display: 'flex', gap: 10, fontSize: 13, padding: '7px 0', borderBottom: '1px solid var(--color-divider)' }}>
                <span style={{ color: 'var(--color-neutral-600)', flex: 'none' }}>−</span><span>{n.text}</span>
              </div>
            ))}
            {negatives.length === 0 && <p className="text-muted" style={{ fontSize: 13 }}>None yet</p>}
            <button className="btn btn-ghost" style={{ marginTop: 8, paddingLeft: 0 }} onClick={() => setNoteType('positive')}>＋ Add a note</button>
          </div>

          <div>
            <h6 style={{ margin: '0 0 10px', color: 'color-mix(in srgb, var(--color-text) 55%, transparent)' }}>Analysis history</h6>
            {(partner.runs || []).map(r => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, padding: '8px 0', borderBottom: '1px solid var(--color-divider)' }}>
                <span>
                  {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  <span className="text-muted" style={{ display: 'block', fontSize: 10.5 }}>{r.model}</span>
                </span>
                <span className="num" style={{ fontFamily: 'var(--font-heading)', fontSize: 17 }}>{r.composite_score?.toFixed(1)}</span>
              </div>
            ))}
            {(!partner.runs || partner.runs.length === 0) && <p className="text-muted" style={{ fontSize: 12 }}>No analyses yet</p>}
          </div>
        </div>

        {/* Main column */}
        <div>
          {latestRun && (
            <div style={{ border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-md)', padding: '22px 24px', marginBottom: 30 }}>
              <div className="card-kicker" style={{ marginBottom: 8 }}>The overall read · {latestRun.model}</div>
              <p style={{ fontSize: 15.5, lineHeight: 1.7, margin: 0, textAlign: 'justify', hyphens: 'auto' }}>{latestRun.summary}</p>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, marginBottom: 14 }}>
            <h4 style={{ margin: 0 }}>Domain by domain</h4>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 14, flex: 'none' }}>
              <span className="text-muted" style={{ fontSize: 11 }}>Priority weights come from your own profile</span>
              {assessments.length > 0 && (
                <button className="btn btn-ghost" style={{ paddingRight: 0 }} onClick={() => setEditingDomains(e => !e)}>
                  {editingDomains ? 'Done editing' : '✎ Edit what you know'}
                </button>
              )}
            </span>
          </div>

          {showForm ? (
            <DomainFormList
              partnerId={id}
              domains={partner.domains}
              scoreMap={scoreMap}
              onSaved={() => { setEditingDomains(false); load(); }}
            />
          ) : (
            DOMAINS.map(d => {
              const a = scoreMap[d.key];
              const state = a ? stateOf(a.score) : 'unknown';
              const known = (domainMap[d.key] || '').trim();
              return (
                <div key={d.key} style={{ display: 'grid', gridTemplateColumns: '22px 1fr 64px', gap: 16, padding: '16px 0', borderTop: '1px solid var(--color-divider)', alignItems: 'start' }}>
                  <DomainMark state={state} size="lg" />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 16 }}>{d.label}</span>
                      <span className="text-muted" style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                        {a ? `${stateLabel(state)}` : 'not assessed'}
                      </span>
                    </div>
                    <p className="text-muted" style={{ fontSize: 13.5, margin: 0, lineHeight: 1.6 }}>{a?.reasoning || 'No assessment yet'}</p>
                    {known && (
                      <p style={{ fontSize: 12.5, margin: '8px 0 0', lineHeight: 1.6, paddingLeft: 11, borderLeft: '2px solid var(--color-divider)' }}>
                        <span className="text-muted" style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>What you recorded</span>
                        {known}
                      </p>
                    )}
                  </div>
                  <div className="num" style={{ fontFamily: 'var(--font-heading)', fontSize: 26, textAlign: 'right', lineHeight: 1 }}>
                    {a ? a.score : '—'}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {noteType && <AddNoteDialog partnerId={id} onClose={() => setNoteType(null)} onSaved={() => { setNoteType(null); load(); }} />}
      {editing && <EditPartnerDialog partner={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function DomainFormList({ partnerId, domains, scoreMap = {}, onSaved }) {
  const serialized = JSON.stringify((domains || []).map(d => [d.domain, d.answer]));

  const [values, setValues] = useState(() => fromProps(domains));
  const [saving, setSaving] = useState(false);

  // Re-sync when the partner reloads (e.g. after a save elsewhere on the page).
  useEffect(() => { setValues(fromProps(domains)); }, [serialized]);

  function fromProps(list) {
    const map = {};
    for (const d of (list || [])) map[d.domain] = d.answer;
    return DOMAINS.reduce((acc, d) => ({ ...acc, [d.key]: map[d.key] || '' }), {});
  }

  async function handleSave() {
    setSaving(true);
    try {
      const domainData = DOMAINS.map(d => ({ domain: d.key, answer: values[d.key] }));
      await api.partners.updateDomains(partnerId, domainData);
      onSaved();
    } catch (e) { console.error(e); }
    setSaving(false);
  }

  return (
    <div>
      <p className="text-muted" style={{ fontSize: 13, marginBottom: 16 }}>
        Fill in what you know — partial information is fine. Save when ready, then recompute.
      </p>
      {DOMAINS.map(d => {
        const a = scoreMap[d.key];
        return (
          <div key={d.key} style={{ borderTop: '1px solid var(--color-divider)', padding: '14px 0' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
              <label style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 16 }}>{d.label}</label>
              {a && (
                <span className="text-muted" style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  last read · {stateLabel(stateOf(a.score))} · {a.score}
                </span>
              )}
            </div>
            <div className="text-muted" style={{ fontSize: 11, marginBottom: 6 }}>{d.hint}</div>
            <textarea
              className="input"
              rows={2}
              value={values[d.key]}
              onChange={e => setValues(v => ({ ...v, [d.key]: e.target.value }))}
              placeholder="What you've learned or observed…"
            />
          </div>
        );
      })}
      <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ marginTop: 12 }}>
        {saving ? 'Saving…' : 'Save domain info'}
      </button>
    </div>
  );
}

function AddNoteDialog({ partnerId, onClose, onSaved }) {
  const [type, setType] = useState('positive');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await api.partners.addNote(partnerId, type, text.trim());
      onSaved();
    } catch (e) { console.error(e); setSaving(false); }
  }

  return (
    <Dialog
      title="Add a note"
      onClose={onClose}
      actions={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!text.trim() || saving}>Add</button>
        </>
      }
    >
      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <button className={`btn ${type === 'positive' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setType('positive')}>＋ Liked</button>
        <button className={`btn ${type === 'negative' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setType('negative')}>− Gave pause</button>
      </div>
      <textarea className="input" value={text} onChange={e => setText(e.target.value)} placeholder="What stood out…" rows={3} autoFocus />
    </Dialog>
  );
}

function EditPartnerDialog({ partner, onClose, onSaved }) {
  const [name, setName] = useState(partner.name);
  const [source, setSource] = useState(partner.source);
  const [status, setStatus] = useState(partner.status);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await api.partners.update(partner.id, { name, source, status });
      onSaved();
    } catch (e) { console.error(e); setSaving(false); }
  }

  return (
    <Dialog
      title="Edit partner"
      onClose={onClose}
      actions={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>Save</button>
        </>
      }
    >
      <div className="field" style={{ marginBottom: 12 }}>
        <label>Name</label>
        <input className="input" value={name} onChange={e => setName(e.target.value)} />
      </div>
      <div className="field" style={{ marginBottom: 12 }}>
        <label>Source</label>
        <input className="input" value={source} onChange={e => setSource(e.target.value)} />
      </div>
      <div className="field">
        <label>Status</label>
        <div className="seg">
          {['active', 'paused', 'rejected'].map(s => (
            <button key={s} className={`seg-opt${status === s ? ' active' : ''}`} onClick={() => setStatus(s)}>{STATUS_LABEL[s]}</button>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
