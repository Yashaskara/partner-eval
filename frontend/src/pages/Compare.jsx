import { useState, useEffect } from 'react';
import { api } from '../api.js';
import { DOMAINS, stateOf, stateLabel, scoreColor, weight } from '../domains.js';
import DomainMark from '../components/DomainMark.jsx';

export default function Compare() {
  const [partners, setPartners] = useState([]);
  const [selected, setSelected] = useState([]);
  const [view, setView] = useState('matrix');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.partners.list().then(data => {
      const withScores = data.filter(p => p.assessments?.length > 0);
      setPartners(withScores);
      setSelected(withScores.slice(0, 3).map(p => p.id));
      setLoading(false);
    });
  }, []);

  function togglePartner(id) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  const cmpPartners = partners.filter(p => selected.includes(p.id));

  if (loading) return <div className="page" style={{ paddingTop: 120, textAlign: 'center' }}>Loading…</div>;

  return (
    <div className="page">
      <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-accent)', marginBottom: 10 }}>Side by side</div>
      <h1 style={{ fontWeight: 400, fontSize: 46, margin: '0 0 10px' }}>Compare</h1>
      <p className="text-muted" style={{ fontSize: 14, margin: '0 0 24px', maxWidth: 640 }}>
        Twelve rows, one column each. Nothing here is a verdict — it's just the same questions asked of everyone, in the order you weighted them.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 28 }}>
        {partners.map(p => (
          <button
            key={p.id}
            className="btn btn-secondary"
            style={selected.includes(p.id) ? { borderColor: 'var(--color-accent)', color: 'var(--color-accent)' } : {}}
            onClick={() => togglePartner(p.id)}
          >
            {p.name}
          </button>
        ))}
      </div>

      {cmpPartners.length >= 2 && (
        <div style={{ marginBottom: 20 }}>
          <div className="seg">
            <button className={`seg-opt${view === 'matrix' ? ' active' : ''}`} onClick={() => setView('matrix')}>Matrix</button>
            {cmpPartners.length === 2 && (
              <button className={`seg-opt${view === 'duel' ? ' active' : ''}`} onClick={() => setView('duel')}>Head to head</button>
            )}
          </div>
        </div>
      )}

      {cmpPartners.length === 0 ? (
        <p className="text-muted">Select at least two partners to compare.</p>
      ) : cmpPartners.length === 1 ? (
        <p className="text-muted">Select one more partner to start comparing.</p>
      ) : view === 'duel' && cmpPartners.length === 2 ? (
        <DuelView left={cmpPartners[0]} right={cmpPartners[1]} />
      ) : (
        <MatrixView partners={cmpPartners} />
      )}
    </div>
  );
}

function MatrixView({ partners }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="table" style={{ tableLayout: 'fixed', minWidth: 600 }}>
        <thead>
          <tr>
            <th style={{ width: 210 }}>Domain</th>
            {partners.map(p => {
              const score = p.latestRun?.composite_score;
              return (
                <th key={p.id} style={{ textAlign: 'left' }}>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 17, textTransform: 'none', letterSpacing: 0, color: 'var(--color-text)' }}>{p.name}</div>
                  {score != null && <div className="num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, fontSize: 30, lineHeight: 1.1, color: scoreColor(score) }}>{score.toFixed(1)}</div>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {DOMAINS.map(d => (
            <tr key={d.key}>
              <td>
                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 15 }}>{d.label}</span>
              </td>
              {partners.map(p => {
                const a = (p.assessments || []).find(x => x.domain === d.key);
                const state = a ? stateOf(a.score) : 'unknown';
                return (
                  <td key={p.id} style={{ verticalAlign: 'top' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <DomainMark state={state} size="lg" />
                      <span className="num" style={{ fontFamily: 'var(--font-heading)', fontSize: 19 }}>{a ? a.score : '—'}</span>
                      <span className="text-muted" style={{ fontSize: 11 }}>{stateLabel(state)}</span>
                    </div>
                    {a?.reasoning && <div className="text-muted" style={{ fontSize: 11.5, lineHeight: 1.5, marginTop: 3 }}>{a.reasoning.slice(0, 120)}{a.reasoning.length > 120 ? '…' : ''}</div>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DuelView({ left, right }) {
  const lScore = left.latestRun?.composite_score;
  const rScore = right.latestRun?.composite_score;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px 1fr', alignItems: 'end', gap: 20, paddingBottom: 18, borderBottom: '1px solid var(--color-divider)' }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 30 }}>{left.name}</div>
          <div className="text-muted" style={{ fontSize: 12.5 }}>{left.source}</div>
          {lScore != null && <div className="num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, fontSize: 56, lineHeight: 1, color: scoreColor(lScore) }}>{lScore.toFixed(1)}</div>}
        </div>
        <div className="text-muted" style={{ textAlign: 'center', fontFamily: 'var(--font-heading)', fontSize: 15, letterSpacing: '0.12em', textTransform: 'uppercase', paddingBottom: 14 }}>versus</div>
        <div>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 30 }}>{right.name}</div>
          <div className="text-muted" style={{ fontSize: 12.5 }}>{right.source}</div>
          {rScore != null && <div className="num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, fontSize: 56, lineHeight: 1, color: scoreColor(rScore) }}>{rScore.toFixed(1)}</div>}
        </div>
      </div>

      {DOMAINS.map(d => {
        const la = (left.assessments || []).find(x => x.domain === d.key);
        const ra = (right.assessments || []).find(x => x.domain === d.key);
        const ls = stateOf(la?.score);
        const rs = stateOf(ra?.score);

        return (
          <div key={d.key} style={{ display: 'grid', gridTemplateColumns: '1fr 150px 1fr', alignItems: 'center', gap: 20, padding: '15px 0', borderBottom: '1px solid var(--color-divider)' }}>
            <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12 }}>
              <span className="text-muted" style={{ fontSize: 12 }}>{la?.reasoning?.slice(0, 80)}{(la?.reasoning?.length || 0) > 80 ? '…' : ''}</span>
              <span className="num" style={{ fontFamily: 'var(--font-heading)', fontSize: 22, opacity: la && ra && la.score > ra.score ? 1 : 0.45 }}>{la ? la.score : '—'}</span>
              <DomainMark state={ls} size="lg" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 14 }}>{d.label}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <DomainMark state={rs} size="lg" />
              <span className="num" style={{ fontFamily: 'var(--font-heading)', fontSize: 22, opacity: la && ra && ra.score > la.score ? 1 : 0.45 }}>{ra ? ra.score : '—'}</span>
              <span className="text-muted" style={{ fontSize: 12 }}>{ra?.reasoning?.slice(0, 80)}{(ra?.reasoning?.length || 0) > 80 ? '…' : ''}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
