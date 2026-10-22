import { useState, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useSession } from './lib/auth-client.js';
import { api } from './api.js';
import Nav from './components/Nav.jsx';
import Roster from './pages/Roster.jsx';
import PartnerDetail from './pages/PartnerDetail.jsx';
import Compare from './pages/Compare.jsx';
import SelfProfile from './pages/SelfProfile.jsx';
import Settings from './pages/Settings.jsx';
import Login from './pages/Login.jsx';
import Admin from './pages/Admin.jsx';
import About from './pages/About.jsx';
import AccessPending from './pages/AccessPending.jsx';

const shellStyle = {
  minHeight: '100vh',
  background: 'var(--color-bg)',
  color: 'var(--color-text)',
  fontFamily: 'var(--font-body)',
};

export default function App() {
  const { data: session, isPending } = useSession();
  const [access, setAccess] = useState(null);

  const userId = session?.user?.id;

  useEffect(() => {
    if (!userId) { setAccess(null); return; }
    let cancelled = false;
    api.accessRequests.me()
      .then(res => { if (!cancelled) setAccess(res); })
      // Fail open: the allowlist is still enforced server-side on every request.
      .catch(() => { if (!cancelled) setAccess({ allowed: true }); });
    return () => { cancelled = true; };
  }, [userId]);

  if (isPending || (session && !access)) {
    return (
      <div style={{ ...shellStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        Loading...
      </div>
    );
  }

  if (!session) {
    return <div style={shellStyle}><Login /></div>;
  }

  if (!access.allowed) {
    return (
      <div style={shellStyle}>
        <AccessPending
          user={session.user}
          request={access.request}
          onRequested={() => setAccess(prev => ({ ...prev, request: { status: 'pending' } }))}
        />
      </div>
    );
  }

  return (
    <div style={shellStyle}>
      <Nav user={session.user} />
      <Routes>
        <Route path="/" element={<Roster />} />
        <Route path="/partner/:id" element={<PartnerDetail />} />
        <Route path="/compare" element={<Compare />} />
        <Route path="/profile" element={<SelfProfile />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/about" element={<About />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/login" element={<Login />} />
      </Routes>
    </div>
  );
}
