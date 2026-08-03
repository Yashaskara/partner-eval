import { NavLink } from 'react-router-dom';

export default function Nav() {
  return (
    <nav className="nav">
      <span className="nav-brand">Kindred</span>
      <NavLink to="/" end>Roster</NavLink>
      <NavLink to="/compare">Compare</NavLink>
      <NavLink to="/profile">Your profile</NavLink>
      <NavLink to="/settings">Settings</NavLink>
    </nav>
  );
}
