export const DOMAINS = [
  { key: 'lifestyle', label: 'Lifestyle', hint: 'Daily rhythm, city, home' },
  { key: 'career', label: 'Career', hint: 'Work, ambition, relocation' },
  { key: 'family', label: 'Family', hint: 'Parents, in-laws, proximity' },
  { key: 'conflict', label: 'Conflict resolution', hint: 'How disagreement goes' },
  { key: 'spirituality', label: 'Spirituality', hint: 'Faith, practice, rituals' },
  { key: 'finances', label: 'Finances', hint: 'Money habits, transparency' },
  { key: 'children', label: 'Children', hint: 'Whether, when, how raised' },
  { key: 'intimacy', label: 'Physical intimacy', hint: 'Affection, expectations' },
  { key: 'hobbies', label: 'Hobbies', hint: 'Time apart and together' },
  { key: 'health', label: 'Health', hint: 'Habits, conditions, care' },
  { key: 'social', label: 'Friends & social', hint: 'Friendships, hosting' },
  { key: 'history', label: 'Previous relationships', hint: 'What happened, what was learned' },
];

export const PRIORITY_WORD = {
  1: 'Dealbreaker territory',
  2: 'Matters a lot',
  3: 'Good to know',
};

export const STATUS_LABEL = {
  active: 'Active',
  paused: 'Paused',
  rejected: 'Closed',
};

export function stateOf(score) {
  if (score == null) return 'unknown';
  if (score >= 7) return 'aligned';
  if (score >= 5) return 'watch';
  return 'flag';
}

export function stateLabel(s) {
  if (s === 'aligned') return 'aligned';
  if (s === 'watch') return 'worth watching';
  if (s === 'flag') return 'flag';
  return 'not yet known';
}

export function weight(priority) {
  return priority === 1 ? 3 : priority === 2 ? 2 : 1;
}

export function computeComposite(assessments, selfDomains) {
  const priorityMap = {};
  for (const d of selfDomains) priorityMap[d.domain] = d.priority;

  let num = 0, den = 0;
  for (const a of assessments) {
    const p = priorityMap[a.domain] || 2;
    const w = weight(p);
    num += a.score * w;
    den += w;
  }
  return den > 0 ? Math.round((num / den) * 10) / 10 : 0;
}

export function scoreColor(v) {
  if (v >= 7.5) return 'var(--color-accent-700)';
  if (v >= 6) return 'var(--color-text)';
  return 'var(--color-neutral-600)';
}
