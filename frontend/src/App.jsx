import { Routes, Route } from 'react-router-dom';
import Nav from './components/Nav.jsx';
import Roster from './pages/Roster.jsx';
import PartnerDetail from './pages/PartnerDetail.jsx';
import Compare from './pages/Compare.jsx';
import SelfProfile from './pages/SelfProfile.jsx';
import Settings from './pages/Settings.jsx';

export default function App() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', color: 'var(--color-text)', fontFamily: 'var(--font-body)' }}>
      <Nav />
      <Routes>
        <Route path="/" element={<Roster />} />
        <Route path="/partner/:id" element={<PartnerDetail />} />
        <Route path="/compare" element={<Compare />} />
        <Route path="/profile" element={<SelfProfile />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </div>
  );
}
