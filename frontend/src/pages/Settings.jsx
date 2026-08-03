import { useState, useEffect } from 'react';
import { api } from '../api.js';

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const data = await api.settings.get();
      setSettings(data);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function setProvider(id) {
    try {
      await api.settings.setProvider(id);
      await load();
    } catch (e) { console.error(e); }
  }

  if (loading) return <div className="page page-settings" style={{ paddingTop: 120, textAlign: 'center' }}>Loading…</div>;

  return (
    <div className="page page-settings">
      <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-accent)', marginBottom: 10 }}>Settings</div>
      <h1 style={{ fontWeight: 400, fontSize: 46, margin: '0 0 10px' }}>Where the thinking happens</h1>
      <p className="text-muted" style={{ fontSize: 14, margin: 0, maxWidth: 560 }}>
        One provider at a time, on purpose — scores written by different models aren't comparable, and comparing is the whole point.
      </p>
      <hr className="hr" style={{ margin: '30px 0 24px' }} />

      <h4 style={{ margin: '0 0 14px' }}>Active provider</h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {(settings?.providers || []).map(p => (
          <div
            key={p.id}
            className="card"
            style={{ padding: '16px 18px', gap: 0, borderColor: p.active ? 'var(--color-accent)' : 'var(--color-divider)', cursor: 'pointer' }}
            onClick={() => setProvider(p.id)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ width: 16, height: 16, flex: 'none', borderRadius: '50%', border: '1.5px solid var(--color-divider)', ...(p.active ? { borderColor: 'var(--color-accent)', background: 'var(--color-accent)', boxShadow: 'inset 0 0 0 4px var(--color-bg)' } : {}) }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 17 }}>{p.name}</div>
                <div className="text-muted num" style={{ fontSize: 12, marginTop: 2 }}>{p.model}</div>
              </div>
              <span className="tag" style={p.keySet ? { background: 'var(--color-accent-100)', color: 'var(--color-accent-800)' } : { border: '1px solid var(--color-neutral-400)', color: 'var(--color-neutral-700)' }}>
                {p.keyMasked}
              </span>
              {p.active && <span className="tag tag-outline">active</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="text-muted" style={{ fontSize: 12.5, marginTop: 14 }}>
        Keys are read from <span className="num">.env</span> in the project folder. They never leave your machine except to call the provider you chose. Change the model per provider in the same file.
      </div>

      <hr className="hr" style={{ margin: '32px 0 24px' }} />
      <h4 style={{ margin: '0 0 6px' }}>Switching providers</h4>
      <p className="text-muted" style={{ fontSize: 13.5, margin: '0 0 16px', maxWidth: 620 }}>
        Every stored score keeps the name of the model that wrote it. Switch now and the roster will show which reads came from where until you recompute them.
      </p>
      {(settings?.provenance || []).length > 0 ? (
        <table className="table">
          <thead>
            <tr><th>Model</th><th>Assessments written</th><th>Most recent</th></tr>
          </thead>
          <tbody>
            {settings.provenance.map(row => (
              <tr key={row.model}>
                <td className="num" style={{ fontSize: 13 }}>{row.model}</td>
                <td className="num">{row.count}</td>
                <td className="text-muted">{row.recent}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-muted" style={{ fontSize: 13 }}>No assessments written yet.</p>
      )}

      <hr className="hr" style={{ margin: '32px 0 24px' }} />
      <h4 style={{ margin: '0 0 6px' }}>Scoring</h4>
      <p className="text-muted" style={{ fontSize: 13.5, margin: '0 0 16px', maxWidth: 620 }}>
        The model writes each domain's read and score. The composite is arithmetic done here, by your weights — so re-sorting after a priority change costs nothing.
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <span className="tag tag-neutral num">Priority 1 · ×3</span>
        <span className="tag tag-neutral num">Priority 2 · ×2</span>
        <span className="tag tag-neutral num">Priority 3 · ×1</span>
        <span className="tag tag-neutral">Unknown domains excluded</span>
      </div>

      <hr className="hr" style={{ margin: '32px 0 24px' }} />
      <h4 style={{ margin: '0 0 6px' }}>Your data</h4>
      <p className="text-muted" style={{ fontSize: 13.5, margin: '0 0 16px', maxWidth: 620 }}>
        One SQLite file, <span className="num">partner-eval.db</span>, sitting in this folder. Copy it, back it up, delete it — nothing is anywhere else.
      </p>
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-secondary">Export as JSON</button>
      </div>
    </div>
  );
}
