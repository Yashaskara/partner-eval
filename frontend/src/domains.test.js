import { describe, it, expect } from 'vitest';
import { stateOf, weight, computeComposite } from './domains.js';

describe('stateOf', () => {
  it('returns aligned for scores >= 7', () => {
    expect(stateOf(7)).toBe('aligned');
    expect(stateOf(10)).toBe('aligned');
  });
  it('returns watch for scores 5-6', () => {
    expect(stateOf(5)).toBe('watch');
    expect(stateOf(6)).toBe('watch');
  });
  it('returns flag for scores < 5', () => {
    expect(stateOf(4)).toBe('flag');
    expect(stateOf(1)).toBe('flag');
  });
  it('returns unknown for null/undefined', () => {
    expect(stateOf(null)).toBe('unknown');
    expect(stateOf(undefined)).toBe('unknown');
  });
});

describe('weight', () => {
  it('priority 1 (dealbreaker) → weight 3', () => {
    expect(weight(1)).toBe(3);
  });
  it('priority 2 (matters a lot) → weight 2', () => {
    expect(weight(2)).toBe(2);
  });
  it('priority 3 (good to know) → weight 1', () => {
    expect(weight(3)).toBe(1);
  });
});

describe('computeComposite', () => {
  it('computes weighted average correctly', () => {
    const assessments = [
      { domain: 'lifestyle', score: 8 },
      { domain: 'career', score: 6 },
    ];
    const selfDomains = [
      { domain: 'lifestyle', priority: 1 },
      { domain: 'career', priority: 3 },
    ];
    expect(computeComposite(assessments, selfDomains)).toBe(7.5);
  });

  it('defaults to priority 2 when not specified', () => {
    const assessments = [{ domain: 'lifestyle', score: 10 }];
    const selfDomains = [];
    expect(computeComposite(assessments, selfDomains)).toBe(10);
  });

  it('returns 0 for empty assessments', () => {
    expect(computeComposite([], [])).toBe(0);
  });

  it('rounds to one decimal', () => {
    const assessments = [
      { domain: 'lifestyle', score: 7 },
      { domain: 'career', score: 8 },
      { domain: 'family', score: 3 },
    ];
    const selfDomains = [
      { domain: 'lifestyle', priority: 1 },
      { domain: 'career', priority: 2 },
      { domain: 'family', priority: 3 },
    ];
    expect(computeComposite(assessments, selfDomains)).toBe(6.7);
  });
});
