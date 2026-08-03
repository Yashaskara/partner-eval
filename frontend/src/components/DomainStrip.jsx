import { DOMAINS, stateOf } from '../domains.js';
import DomainMark from './DomainMark.jsx';

export default function DomainStrip({ assessments, size = 'md' }) {
  const scoreMap = {};
  for (const a of (assessments || [])) scoreMap[a.domain] = a.score;

  const counts = { aligned: 0, watch: 0, flag: 0, unknown: 0 };
  const marks = DOMAINS.map(d => {
    const score = scoreMap[d.key];
    const state = stateOf(score);
    counts[state]++;
    return { domain: d, state, score };
  });

  const strip = [
    counts.aligned + ' aligned',
    counts.watch + ' watching',
    counts.flag ? counts.flag + ' flagged' : null,
    counts.unknown ? counts.unknown + ' unknown' : null,
  ].filter(Boolean).join(' · ');

  return (
    <div>
      <div style={{ display: 'flex', gap: size === 'sm' ? 3 : 4 }}>
        {marks.map(m => (
          <span key={m.domain.key} title={`${m.domain.label} — ${m.score == null ? 'not known' : m.score + '/10'}`}>
            <DomainMark state={m.state} size={size} />
          </span>
        ))}
      </div>
      <div className="text-muted" style={{ fontSize: size === 'sm' ? 10.5 : 11, marginTop: size === 'sm' ? 0 : 7 }}>
        {strip}
      </div>
    </div>
  );
}

export function getDomainCounts(assessments) {
  const scoreMap = {};
  for (const a of (assessments || [])) scoreMap[a.domain] = a.score;
  const counts = { aligned: 0, watch: 0, flag: 0, unknown: 0 };
  for (const d of DOMAINS) {
    counts[stateOf(scoreMap[d.key])]++;
  }
  return counts;
}
