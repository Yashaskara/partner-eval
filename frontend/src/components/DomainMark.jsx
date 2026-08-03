export default function DomainMark({ state, size = 'md' }) {
  const w = size === 'sm' ? 7 : size === 'lg' ? 13 : 9;
  const h = size === 'sm' ? 16 : size === 'lg' ? 13 : 22;

  const base = {
    display: 'inline-block',
    flex: 'none',
    width: w,
    height: h,
    borderRadius: 1,
  };

  const variants = {
    aligned: {
      background: 'var(--color-accent-600)',
    },
    watch: {
      background: 'linear-gradient(to top, var(--color-accent-400) 50%, transparent 50%)',
      boxShadow: 'inset 0 0 0 1px var(--color-accent-400)',
    },
    flag: {
      background: 'repeating-linear-gradient(45deg, var(--color-neutral-900) 0 1.5px, transparent 1.5px 4.5px)',
      boxShadow: 'inset 0 0 0 1px var(--color-neutral-900)',
    },
    unknown: {
      boxShadow: 'inset 0 0 0 1px var(--color-neutral-300)',
    },
  };

  return <span style={{ ...base, ...variants[state || 'unknown'] }} />;
}
