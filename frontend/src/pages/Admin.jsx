import { useState, useEffect } from 'react';
import { api } from '../api.js';

export default function Admin() {
  const [tab, setTab] = useState('allowlist');

  return (
    <div className="page page-narrow">
      <div style={{ maxWidth: 620, marginBottom: 20 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-accent)', marginBottom: 10 }}>Admin</div>
        <h1 style={{ fontWeight: 400, fontSize: 46, margin: '0 0 10px' }}>Dashboard</h1>
        <p className="text-muted" style={{ fontSize: 14, margin: 0 }}>
          Manage access, monitor usage, and set limits.
        </p>
      </div>

      <div className="seg" style={{ marginBottom: 22 }}>
        <button className={`seg-opt${tab === 'allowlist' ? ' active' : ''}`} onClick={() => setTab('allowlist')}>Allowlist</button>
        <button className={`seg-opt${tab === 'users' ? ' active' : ''}`} onClick={() => setTab('users')}>Users & usage</button>
        <button className={`seg-opt${tab === 'limits' ? ' active' : ''}`} onClick={() => setTab('limits')}>Limits</button>
      </div>
      <hr className="hr" style={{ margin: '0 0 22px' }} />

      {tab === 'allowlist' && <AllowlistTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'limits' && <LimitsTab />}
    </div>
  );
}

function AllowlistTab() {
  const [list, setList] = useState([]);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    try { setList(await api.admin.getAllowlist()); } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!email.trim()) return;
    await api.admin.addToAllowlist(email.trim());
    setEmail('');
    load();
  }

  async function handleRemove(em) {
    if (!confirm(`Remove ${em} from allowlist?`)) return;
    await api.admin.removeFromAllowlist(em);
    load();
  }

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 10, marginBottom: 22 }}>
        <input
          className="input"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="email@example.com"
          type="email"
          style={{ flex: 1 }}
        />
        <button className="btn btn-primary" type="submit">Add</button>
      </form>

      <div style={{ borderTop: '1px solid var(--color-divider)' }}>
        {list.map(item => (
          <div key={item.email} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 10px', borderBottom: '1px solid var(--color-divider)' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{item.email}</div>
              <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>
                Added {item.added_at ? new Date(item.added_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'unknown'}
                {item.added_by && ` by ${item.added_by}`}
              </div>
            </div>
            <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => handleRemove(item.email)}>Remove</button>
          </div>
        ))}
        {list.length === 0 && <p className="text-muted" style={{ padding: 20, textAlign: 'center' }}>No emails in allowlist</p>}
      </div>
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState([]);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const [u, s] = await Promise.all([api.admin.getUsers(), api.admin.getUsage()]);
      setUsers(u);
      setUsage(s);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  if (loading) return <p>Loading...</p>;

  function formatTokens(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
  }

  function formatCost(n) {
    if (n < 0.01) return '<$0.01';
    return '$' + n.toFixed(2);
  }

  return (
    <div>
      {usage?.allTime && (
        <div style={{ display: 'flex', gap: 30, marginBottom: 22 }}>
          <div>
            <div className="text-muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Total tokens</div>
            <div style={{ fontSize: 28, fontFamily: 'var(--font-heading)', fontWeight: 600 }}>
              {formatTokens(Number(usage.allTime.total_input) + Number(usage.allTime.total_output))}
            </div>
          </div>
          <div>
            <div className="text-muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Est. cost</div>
            <div style={{ fontSize: 28, fontFamily: 'var(--font-heading)', fontWeight: 600 }}>{formatCost(usage.allTime.estimated_cost || 0)}</div>
          </div>
          <div>
            <div className="text-muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Total calls</div>
            <div style={{ fontSize: 28, fontFamily: 'var(--font-heading)', fontWeight: 600 }}>{usage.allTime.total_calls}</div>
          </div>
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--color-divider)' }}>
        {users.map(u => (
          <div key={u.id} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 80px 80px', gap: 16, padding: '14px 10px', borderBottom: '1px solid var(--color-divider)', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{u.name || u.email}</div>
              <div className="text-muted" style={{ fontSize: 11 }}>{u.email}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 14, fontFamily: 'var(--font-heading)', fontWeight: 600 }}>{formatTokens(Number(u.total_tokens))}</div>
              <div className="text-muted" style={{ fontSize: 10 }}>tokens</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 14, fontFamily: 'var(--font-heading)', fontWeight: 600 }}>{formatCost(u.estimated_cost || 0)}</div>
              <div className="text-muted" style={{ fontSize: 10 }}>est. cost</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 14, fontFamily: 'var(--font-heading)', fontWeight: 600 }}>{u.total_calls}</div>
              <div className="text-muted" style={{ fontSize: 10 }}>calls</div>
            </div>
          </div>
        ))}
        {users.length === 0 && <p className="text-muted" style={{ padding: 20, textAlign: 'center' }}>No users yet</p>}
      </div>
    </div>
  );
}

function LimitsTab() {
  const [users, setUsers] = useState([]);
  const [limits, setLimits] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const u = await api.admin.getUsers();
      setUsers(u);
      const initLimits = {};
      u.forEach(user => { initLimits[user.id] = '100000'; });
      setLimits(initLimits);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function handleSetLimit(userId) {
    const val = Number(limits[userId]);
    if (!val || val < 0) return;
    try {
      await api.admin.setUserLimit(userId, val);
      alert('Limit updated');
    } catch (e) { alert('Failed: ' + e.message); }
  }

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 18 }}>
        Set daily token limits per user. Default is 100,000 tokens/day.
      </p>
      <div style={{ borderTop: '1px solid var(--color-divider)' }}>
        {users.map(u => (
          <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 10px', borderBottom: '1px solid var(--color-divider)' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{u.name || u.email}</div>
              <div className="text-muted" style={{ fontSize: 11 }}>{u.email}</div>
            </div>
            <input
              className="input"
              type="number"
              value={limits[u.id] || ''}
              onChange={e => setLimits(prev => ({ ...prev, [u.id]: e.target.value }))}
              style={{ width: 120, textAlign: 'right' }}
            />
            <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => handleSetLimit(u.id)}>Set</button>
          </div>
        ))}
        {users.length === 0 && <p className="text-muted" style={{ padding: 20, textAlign: 'center' }}>No users yet</p>}
      </div>
    </div>
  );
}
