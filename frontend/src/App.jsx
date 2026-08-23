import { Routes, Route } from 'react-router-dom';
import { useSession } from './lib/auth-client.js';
import Nav from './components/Nav.jsx';
import Roster from './pages/Roster.jsx';
import PartnerDetail from './pages/PartnerDetail.jsx';
import Compare from './pages/Compare.jsx';
import SelfProfile from './pages/SelfProfile.jsx';
import Settings from './pages/Settings.jsx';
import Login from './pages/Login.jsx';
import Admin from './pages/Admin.jsx';

export default function App() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--color-bg)', color: 'var(--color-text)', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        Loading...
      </div>
    );
  }

  if (!session) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--color-bg)', color: 'var(--color-text)', fontFamily: 'var(--font-body)' }}>
        <Login />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', color: 'var(--color-text)', fontFamily: 'var(--font-body)' }}>
      <Nav user={session.user} />
      <Routes>
        <Route path="/" element={<Roster />} />
        <Route path="/partner/:id" element={<PartnerDetail />} />
        <Route path="/compare" element={<Compare />} />
        <Route path="/profile" element={<SelfProfile />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/login" element={<Login />} />
      </Routes>
    </div>
  );
}
