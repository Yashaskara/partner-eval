import { NavLink } from 'react-router-dom';
import { signOut } from '../lib/auth-client.js';

export default function Nav({ user }) {
  const isAdmin = user?.email === import.meta.env.VITE_ADMIN_EMAIL;

  return (
    <nav className="nav">
      <span className="nav-brand">Anvaya</span>
      <NavLink to="/" end>Roster</NavLink>
      <NavLink to="/compare">Compare</NavLink>
      <NavLink to="/profile">Your profile</NavLink>
      <NavLink to="/settings">Settings</NavLink>
      <NavLink to="/about">About</NavLink>
      {isAdmin && <NavLink to="/admin">Admin</NavLink>}
      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
        {user?.image && (
          <img
            src={user.image}
            alt=""
            style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover' }}
            referrerPolicy="no-referrer"
          />
        )}
        <span className="text-muted" style={{ fontSize: 12.5 }}>{user?.name}</span>
        <button
          className="btn btn-ghost"
          style={{ fontSize: 11, padding: '3px 8px' }}
          onClick={() => signOut({ fetchOptions: { credentials: 'include' } })}
        >
          Sign out
        </button>
      </span>
    </nav>
  );
}
