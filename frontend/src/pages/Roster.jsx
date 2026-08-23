import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { DOMAINS, STATUS_LABEL, stateOf, scoreColor, weight } from '../domains.js';
import DomainStrip, { getDomainCounts } from '../components/DomainStrip.jsx';
import DomainMark from '../components/DomainMark.jsx';
import Dialog from '../components/Dialog.jsx';

export default function Roster() {
  const [partners, setPartners] = useState([]);
  const [filter, setFilter] = useState('all');
  const [view, setView] = useState('grid');
  const [showAdd, setShowAdd] = useState(false);
  const [selfDomains, setSelfDomains] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const [data, profile] = await Promise.all([
        api.partners.list(),
        api.selfProfile.get(),
      ]);
      setPartners(data);
      setSelfDomains(profile.domains || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  function getComposite(p) {
    if (!p.assessments?.length) return null;
    const priorityMap = {};
    for (const d of selfDomains) priorityMap[d.domain] = d.priority;
    const scoreMap = {};
    for (const a of p.assessments) scoreMap[a.domain] = a.score;
    let num = 0, den = 0;
    for (const d of DOMAINS) {
      const s = scoreMap[d.key];
      if (s == null) continue;
      const w = weight(priorityMap[d.key] || 2);
      num += s * w;
      den += w;
    }
    return den > 0 ? Math.round((num / den) * 10) / 10 : null;
  }

  const filtered = partners
    .filter(p => filter === 'all' || p.status === filter)
    .map(p => {
      const score = p.latestRun?.composite_score ?? getComposite(p);
      return { ...p, compositeScore: score };
    })
    .sort((a, b) => (b.compositeScore ?? 0) - (a.compositeScore ?? 0));

  const statusCounts = { all: partners.length };
  for (const p of partners) statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;

  const stalePartners = partners.filter(p => p.stale);
  const isEmpty = partners.length === 0;

  if (loading) return <div className="page" style={{ textAlign: 'center', paddingTop: 120 }}>Loading…</div>;

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 32 }}>
        <div style={{ maxWidth: 620 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-accent)', marginBottom: 10 }}>The roster</div>
          <h1 style={{ fontWeight: 400, fontSize: 46, margin: '0 0 10px' }}>People you're getting to know</h1>
          <p className="text-muted" style={{ fontSize: 14, margin: 0 }}>
            Scores are yours, not theirs — a weighted read of how someone sits against the twelve things you said matter, in the order you said they mattered.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flex: 'none' }}>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>＋ Add someone</button>
        </div>
      </div>

      <hr className="hr" style={{ margin: '30px 0 22px' }} />

      {isEmpty ? (
        <EmptyState onAdd={() => setShowAdd(true)} />
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 22 }}>
            <div className="seg">
              {[['all', `All ${statusCounts.all}`], ['active', `Active ${statusCounts.active || 0}`], ['paused', `Paused ${statusCounts.paused || 0}`], ['rejected', `Closed ${statusCounts.rejected || 0}`]].map(([key, label]) => (
                <button key={key} className={`seg-opt${filter === key ? ' active' : ''}`} onClick={() => setFilter(key)}>{label}</button>
              ))}
            </div>

            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14, fontSize: 11, color: 'color-mix(in srgb, var(--color-text) 55%, transparent)' }}>
              {[['aligned', 'Aligned'], ['watch', 'Worth watching'], ['flag', 'Flag'], ['unknown', 'Not yet known']].map(([s, label]) => (
                <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <DomainMark state={s} size="sm" />{label}
                </span>
              ))}
            </span>

            <div className="seg" style={{ marginLeft: 16 }}>
              <button className={`seg-opt${view === 'grid' ? ' active' : ''}`} onClick={() => setView('grid')}>Cards</button>
              <button className={`seg-opt${view === 'list' ? ' active' : ''}`} onClick={() => setView('list')}>List</button>
            </div>
          </div>

          {stalePartners.length > 0 && (
            <div className="stale-banner" style={{ marginBottom: 26 }}>
              <span>You changed your own profile — {stalePartners.length} score{stalePartners.length > 1 ? 's were' : ' was'} computed before that and may no longer reflect what you said matters.</span>
              <button className="btn btn-ghost" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>Recompute {stalePartners.length === 1 ? 'it' : `all ${stalePartners.length}`} →</button>
            </div>
          )}

          {view === 'grid' ? (
            <CardGrid partners={filtered} navigate={navigate} />
          ) : (
            <RankedList partners={filtered} navigate={navigate} />
          )}
        </>
      )}

      {showAdd && <AddPartnerDialog onClose={() => setShowAdd(false)} onCreated={(id) => { setShowAdd(false); navigate(`/partner/${id}`); }} />}
    </div>
  );
}

function EmptyState({ onAdd }) {
  return (
    <div style={{ border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-md)', padding: '96px 40px', textAlign: 'center' }}>
      <div style={{ display: 'flex', gap: 7, justifyContent: 'center', marginBottom: 26 }}>
        {DOMAINS.map(d => <DomainMark key={d.key} state="unknown" size="lg" />)}
      </div>
      <h3 style={{ fontWeight: 400, fontSize: 27, margin: '0 0 8px' }}>Nobody here yet</h3>
      <p className="text-muted" style={{ fontSize: 14, maxWidth: 400, margin: '0 auto 22px' }}>
        Add the first person after you've met them — even half-remembered impressions are enough to start. You can fill the rest in as you learn it.
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        <button className="btn btn-primary" onClick={onAdd}>＋ Add someone</button>
        <Link to="/profile" className="btn btn-ghost">First, set up your own profile →</Link>
      </div>
    </div>
  );
}

function CardGrid({ partners, navigate }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
      {partners.map(p => {
        const counts = getDomainCounts(p.assessments);
        const score = p.compositeScore;
        return (
          <div key={p.id} className="k-card-link" onClick={() => navigate(`/partner/${p.id}`)} style={{ cursor: 'pointer' }}>
            <div className="card" style={{ padding: 20, gap: 0, height: '100%', transition: 'border-color .15s' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
                <div>
                  <div className="card-kicker" style={{ marginBottom: 5 }}>{STATUS_LABEL[p.status]}</div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontSize: 24, lineHeight: 1.1 }}>{p.name}</div>
                  <div className="text-muted" style={{ fontSize: 12.5, marginTop: 4 }}>{p.source}</div>
                </div>
                {score != null && (
                  <div style={{ textAlign: 'right', flex: 'none' }}>
                    <div className="num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, fontSize: 40, lineHeight: 1, color: scoreColor(score) }}>{score.toFixed(1)}</div>
                    <div className="text-muted" style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>weighted</div>
                  </div>
                )}
              </div>

              <div style={{ margin: '20px 0 10px' }}>
                <DomainStrip assessments={p.assessments} />
              </div>

              <hr className="hr" style={{ margin: '16px 0 12px' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 11 }}>
                {p.latestRun && <span className="text-muted">analysed {new Date(p.latestRun.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>}
                {!p.latestRun && <span className="text-muted">not yet analysed</span>}
                {p.stale && <span className="tag tag-accent">stale</span>}
                {counts.flag > 0 && <span className="tag tag-outline">{counts.flag === 1 ? '1 flag' : `${counts.flag} flags`}</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RankedList({ partners, navigate }) {
  return (
    <div style={{ borderTop: '1px solid var(--color-divider)' }}>
      {partners.map((p, i) => {
        const counts = getDomainCounts(p.assessments);
        const score = p.compositeScore;
        return (
          <div key={p.id} className="k-row" onClick={() => navigate(`/partner/${p.id}`)} style={{ cursor: 'pointer', display: 'grid', gridTemplateColumns: '90px 1fr 210px 150px 120px', alignItems: 'center', gap: 26, padding: '24px 12px', borderBottom: '1px solid var(--color-divider)' }}>
            <div className="num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, fontSize: 52, lineHeight: 1, color: 'var(--color-neutral-400)' }}>
              {String(i + 1).padStart(2, '0')}
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 26, lineHeight: 1.1 }}>{p.name}</div>
              <div className="text-muted" style={{ fontSize: 12.5, marginTop: 4 }}>{p.source}</div>
            </div>
            <DomainStrip assessments={p.assessments} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              <span className="tag tag-neutral">{STATUS_LABEL[p.status]}</span>
              {p.stale && <span className="tag tag-accent">stale</span>}
              {counts.flag > 0 && <span className="tag tag-outline">{counts.flag === 1 ? '1 flag' : `${counts.flag} flags`}</span>}
            </div>
            <div style={{ textAlign: 'right' }}>
              {score != null && (
                <>
                  <div className="num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, fontSize: 42, lineHeight: 1, color: scoreColor(score) }}>{score.toFixed(1)}</div>
                  {p.latestRun && <div className="text-muted" style={{ fontSize: 10.5 }}>analysed {new Date(p.latestRun.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AddPartnerDialog({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [source, setSource] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const { id } = await api.partners.create({ name: name.trim(), source: source.trim() });
      onCreated(id);
    } catch (e) { console.error(e); setSaving(false); }
  }

  return (
    <Dialog
      title="Add someone"
      onClose={onClose}
      actions={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!name.trim() || saving}>
            {saving ? 'Adding…' : 'Add'}
          </button>
        </>
      }
    >
      <div className="field" style={{ marginBottom: 12 }}>
        <label>Name</label>
        <input className="input" value={name} onChange={e => setName(e.target.value)} autoFocus placeholder="Their name" />
      </div>
      <div className="field">
        <label>How you met / source</label>
        <input className="input" value={source} onChange={e => setSource(e.target.value)} placeholder="e.g. family friend, matrimonial site" />
      </div>
    </Dialog>
  );
}
