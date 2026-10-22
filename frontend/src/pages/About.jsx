import { Link } from 'react-router-dom';
import { DOMAINS } from '../domains.js';
import DomainMark from '../components/DomainMark.jsx';

const STEPS = [
  {
    num: '01',
    title: 'Build your self-profile',
    body: 'Answer questions across twelve life domains — lifestyle, career, family, finances, and more. Set priorities so the things that matter most to you carry the most weight.',
    link: '/profile',
    linkLabel: 'Set up your profile',
  },
  {
    num: '02',
    title: 'Add people you\'re getting to know',
    body: 'After a meeting or a call, jot down what you learned — even half-remembered impressions are enough. You can fill in more as conversations continue.',
    link: '/',
    linkLabel: 'Go to the roster',
  },
  {
    num: '03',
    title: 'Get a clear-eyed read',
    body: 'Anvaya scores each person against the twelve domains, weighted by your priorities. You see where you\'re aligned, what\'s worth watching, and where the flags are — before feelings cloud the picture.',
  },
];

const PRINCIPLES = [
  {
    heading: 'Your lens, not theirs',
    text: 'Scores reflect how someone sits against what you said matters, in the order you said it mattered. Two people using Anvaya for the same person will see different numbers.',
  },
  {
    heading: 'Honest over generous',
    text: 'The profile works best when you answer what you actually want, not what sounds reasonable. Anvaya doesn\'t judge your priorities — it uses them.',
  },
  {
    heading: 'Private by default',
    text: 'Your profile, your roster, and every score belong to you. Nobody else sees them — not the people you\'re evaluating, not other users.',
  },
];

export default function About() {
  return (
    <div className="page page-narrow">
      {/* Hero */}
      <div style={{ maxWidth: 660, marginBottom: 60 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-accent)', marginBottom: 10 }}>
          About Anvaya
        </div>
        <h1 style={{ fontWeight: 400, fontSize: 46, margin: '0 0 16px' }}>
          Know what you want. See where people stand.
        </h1>
        <p className="text-muted" style={{ fontSize: 15.5, lineHeight: 1.7, margin: 0 }}>
          Anvaya is a private space for evaluating compatibility with potential life partners.
          You define what matters across twelve domains of life, then evaluate the people
          you're meeting against that framework — clearly, honestly, and without guesswork.
        </p>
      </div>

      {/* Domain strip */}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 14 }}>
        {DOMAINS.map(d => (
          <span key={d.key} className="tag tag-neutral" style={{ fontSize: 12, padding: '5px 12px' }}>
            {d.label}
          </span>
        ))}
      </div>
      <p className="text-muted" style={{ fontSize: 12.5, margin: '0 0 60px' }}>
        The twelve domains everything is built around.
      </p>

      <hr className="hr" style={{ margin: '0 0 50px' }} />

      {/* How it works */}
      <div style={{ marginBottom: 60 }}>
        <h2 style={{ fontWeight: 400, fontSize: 32, margin: '0 0 36px' }}>How it works</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 30 }}>
          {STEPS.map(s => (
            <div key={s.num}>
              <div className="num" style={{ fontFamily: 'var(--font-heading)', fontSize: 36, color: 'var(--color-neutral-300)', marginBottom: 12 }}>
                {s.num}
              </div>
              <h3 style={{ fontWeight: 600, fontSize: 20, margin: '0 0 8px' }}>{s.title}</h3>
              <p className="text-muted" style={{ fontSize: 13.5, lineHeight: 1.65, margin: '0 0 14px' }}>
                {s.body}
              </p>
              {s.link && (
                <Link to={s.link} className="btn btn-ghost" style={{ padding: '2px 4px', fontSize: 13 }}>
                  {s.linkLabel} →
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>

      <hr className="hr" style={{ margin: '0 0 50px' }} />

      {/* Scoring explained */}
      <div style={{ marginBottom: 60, maxWidth: 660 }}>
        <h2 style={{ fontWeight: 400, fontSize: 32, margin: '0 0 14px' }}>How scoring works</h2>
        <p className="text-muted" style={{ fontSize: 14, lineHeight: 1.7, margin: '0 0 24px' }}>
          Each domain gets a score from 1 to 10 based on how well someone matches what you described in your profile.
          Domains you marked as higher priority carry more weight in the composite score. The result is a single
          number — a weighted read of overall compatibility, calibrated to your values.
        </p>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          {[
            { state: 'aligned', label: 'Aligned', desc: 'Score 7+' },
            { state: 'watch', label: 'Worth watching', desc: 'Score 5–6' },
            { state: 'flag', label: 'Flag', desc: 'Score below 5' },
            { state: 'unknown', label: 'Not yet known', desc: 'No data yet' },
          ].map(item => (
            <div key={item.state} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <DomainMark state={item.state} size="sm" />
              <span style={{ fontSize: 13 }}>
                <strong style={{ fontWeight: 600 }}>{item.label}</strong>
                <span className="text-muted"> — {item.desc}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <hr className="hr" style={{ margin: '0 0 50px' }} />

      {/* Principles */}
      <div style={{ marginBottom: 60 }}>
        <h2 style={{ fontWeight: 400, fontSize: 32, margin: '0 0 36px' }}>Principles</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 30 }}>
          {PRINCIPLES.map(p => (
            <div key={p.heading}>
              <h3 style={{ fontWeight: 600, fontSize: 20, margin: '0 0 8px' }}>{p.heading}</h3>
              <p className="text-muted" style={{ fontSize: 13.5, lineHeight: 1.65, margin: 0 }}>
                {p.text}
              </p>
            </div>
          ))}
        </div>
      </div>

      <hr className="hr" style={{ margin: '0 0 50px' }} />

      {/* CTA */}
      <div style={{ textAlign: 'center', padding: '40px 0 20px' }}>
        <h2 style={{ fontWeight: 400, fontSize: 28, margin: '0 0 10px' }}>Ready to start?</h2>
        <p className="text-muted" style={{ fontSize: 14, margin: '0 0 22px' }}>
          Begin by filling in your self-profile — everything downstream leans on it.
        </p>
        <Link to="/profile" className="btn btn-primary" style={{ fontSize: 15, padding: '12px 32px' }}>
          Set up your profile →
        </Link>
      </div>
    </div>
  );
}
