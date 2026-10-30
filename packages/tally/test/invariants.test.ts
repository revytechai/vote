import { describe, expect, it } from 'vitest';

import { tally, type TallyMethod, type TallyResult } from '../src/index.js';

interface TestCase {
  method: TallyMethod;
  candidates: number[];
  ballots: Array<Record<number, number>>;
  maxScore: number;
}

/** Deterministic PRNG so a failure is reproducible. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomCase(rng: () => number): TestCase {
  const methods: readonly TallyMethod[] = ['star', 'score', 'approval'];
  const method = methods[Math.floor(rng() * methods.length)] ?? 'score';
  const maxScore = method === 'approval' ? 1 : 1 + Math.floor(rng() * 5);

  const candidates: number[] = [];
  for (let index = 0; index < Math.floor(rng() * 5); index += 1) {
    candidates.push(Math.floor(rng() * 50));
  }

  const ballots: Array<Record<number, number>> = [];
  for (let ballot = 0; ballot < Math.floor(rng() * 6); ballot += 1) {
    const scores: Record<number, number> = {};
    for (const id of candidates) {
      if (rng() < 0.75) {
        scores[id] = Math.floor(rng() * (maxScore + 1));
      }
    }
    ballots.push(scores);
  }

  return { method, candidates, ballots, maxScore };
}

function checkInvariants(result: TallyResult, testCase: TestCase): void {
  const uniqueIds = new Set(testCase.candidates);

  // One row per candidate, no more and no less.
  expect(result.rows).toHaveLength(uniqueIds.size);
  expect(new Set(result.rows.map((row) => row.id)).size).toBe(uniqueIds.size);

  // Ranks are 1..n with no gaps and the winner comes first.
  expect(result.rows.map((row) => row.rank)).toEqual(
    result.rows.map((_, index) => index + 1),
  );
  expect(result.winner).toBe(result.rows[0]?.id ?? null);

  // Totals and means are the scores that were actually cast.
  for (const row of result.rows) {
    const expectedTotal = testCase.ballots.reduce((sum, ballot) => sum + (ballot[row.id] ?? 0), 0);
    expect(row.total).toBe(expectedTotal);
    expect(row.mean).toBe(testCase.ballots.length > 0 ? expectedTotal / testCase.ballots.length : 0);
  }

  if (result.method === 'star' && result.rows.length >= 2) {
    const runoff = result.runoff;
    expect(runoff).not.toBeNull();
    // The runoff winner is ranked first and the other finalist second.
    expect(result.rows[0]?.id).toBe(runoff?.winner);
    const loser = runoff?.winner === runoff?.a ? runoff?.b : runoff?.a;
    expect(result.rows[1]?.id).toBe(loser);
    // Every ballot is counted exactly once.
    expect((runoff?.preferA ?? 0) + (runoff?.preferB ?? 0) + (runoff?.equal ?? 0)).toBe(
      result.ballots,
    );
  } else {
    expect(result.runoff).toBeNull();
  }
}

describe('invariants', () => {
  it('holds over a wide range of random rounds', () => {
    const rng = mulberry32(20261030);

    for (let run = 0; run < 500; run += 1) {
      const testCase = randomCase(rng);
      const result = tally(
        testCase.method,
        testCase.candidates,
        testCase.ballots,
        { maxScore: testCase.maxScore },
      );

      expect(result.method).toBe(testCase.method);
      expect(result.ballots).toBe(testCase.ballots.length);
      checkInvariants(result, testCase);
    }
  });

  it('never throws on a valid round', () => {
    const rng = mulberry32(7);

    for (let run = 0; run < 200; run += 1) {
      const testCase = randomCase(rng);
      expect(() =>
        tally(testCase.method, testCase.candidates, testCase.ballots, {
          maxScore: testCase.maxScore,
        }),
      ).not.toThrow();
    }
  });
});

describe('range boundaries', () => {
  const methods: readonly TallyMethod[] = ['star', 'score', 'approval'];

  it('accepts the top of the range and rejects everything above it', () => {
    for (const method of methods) {
      for (const maxScore of [1, 2, 5, 10]) {
        const limit = method === 'approval' ? 1 : maxScore;

        expect(() => tally(method, [1], [{ 1: limit }], { maxScore })).not.toThrow();
        expect(() => tally(method, [1], [{ 1: limit + 1 }], { maxScore })).toThrow(RangeError);
        expect(() => tally(method, [1], [{ 1: -1 }], { maxScore })).toThrow(RangeError);
      }
    }
  });

  it('defaults the top of the range to five', () => {
    expect(() => tally('score', [1], [{ 1: 5 }])).not.toThrow();
    expect(() => tally('star', [1, 2], [{ 1: 5, 2: 1 }])).not.toThrow();
    expect(() => tally('score', [1], [{ 1: 6 }])).toThrow(RangeError);
  });
});
