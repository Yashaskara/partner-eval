export function requireAdmin(req, res, next) {
  if (req.user.email.toLowerCase() !== (process.env.ADMIN_EMAIL || '').toLowerCase()) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}
