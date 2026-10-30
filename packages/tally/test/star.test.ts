import { describe, expect, it } from 'vitest';

import { tally } from '../src/index.js';

describe('star scoring round', () => {
  it('runs a runoff between the top two candidates', () => {
    // totals: 1 -> 10, 2 -> 6
    const result = tally('star', [1, 2], [
      { 1: 5, 2: 0 },
      { 1: 5, 2: 1 },
      { 1: 0, 2: 5 },
    ]);

    expect(result.runoff).toEqual({
      a: 1,
      b: 2,
      preferA: 2,
      preferB: 1,
      equal: 0,
      winner: 1,
      tiebreak: 'runoff',
    });
    expect(result.winner).toBe(1);
  });

  it('takes the finalists from the score order, not from the candidate list order', () => {
    // totals: 1 -> 3, 2 -> 7, 3 -> 5
    const result = tally('star', [3, 1, 2], [
      { 1: 3, 2: 4, 3: 0 },
      { 1: 0, 2: 3, 3: 5 },
    ]);

    expect(result.runoff?.a).toBe(2);
    expect(result.runoff?.b).toBe(3);
    expect(result.rows.map((row) => row.id)).toEqual([2, 3, 1]);
  });

  it('ranks the runoff winner first even when it trails on points', () => {
    // totals: 1 -> 13, 2 -> 10
    const result = tally('star', [1, 2], [
      { 1: 5, 2: 0 },
      { 1: 4, 2: 5 },
      { 1: 4, 2: 5 },
    ]);

    expect(result.runoff).toEqual({
      a: 1,
      b: 2,
      preferA: 1,
      preferB: 2,
      equal: 0,
      winner: 2,
      tiebreak: 'runoff',
    });
    expect(result.winner).toBe(2);
    expect(result.rows).toEqual([
      { id: 2, total: 10, mean: 10 / 3, rank: 1 },
      { id: 1, total: 13, mean: 13 / 3, rank: 2 },
    ]);
  });

  it('keeps the remaining candidates in score order after the runoff', () => {
    const result = tally('star', [1, 2, 3], [
      { 1: 5, 2: 0, 3: 1 },
      { 1: 4, 2: 5, 3: 0 },
      { 1: 4, 2: 5, 3: 0 },
    ]);

    expect(result.rows.map((row) => row.id)).toEqual([2, 1, 3]);
    expect(result.rows.map((row) => row.rank)).toEqual([1, 2, 3]);
    expect(result.rows[2]).toEqual({ id: 3, total: 1, mean: 1 / 3, rank: 3 });
  });

  it('does not run a runoff with a single candidate', () => {
    const result = tally('star', [7], [{ 7: 4 }]);

    expect(result.runoff).toBeNull();
    expect(result.winner).toBe(7);
    expect(result.rows).toEqual([{ id: 7, total: 4, mean: 4, rank: 1 }]);
  });

  it('resolves an empty ballot list with the id tie-break', () => {
    const result = tally('star', [2, 1], []);

    expect(result.runoff).toEqual({
      a: 1,
      b: 2,
      preferA: 0,
      preferB: 0,
      equal: 0,
      winner: 1,
      tiebreak: 'id',
    });
    expect(result.winner).toBe(1);
  });
});

describe('star runoff tie-breaks', () => {
  it('falls back to the higher total when the runoff is tied', () => {
    // totals: 1 -> 9, 2 -> 5; the runoff is tied 1-1
    const result = tally('star', [1, 2], [
      { 1: 5, 2: 0 },
      { 1: 4, 2: 5 },
    ]);

    expect(result.runoff?.tiebreak).toBe('total');
    expect(result.runoff?.winner).toBe(1);
    expect(result.winner).toBe(1);
  });

  it('falls back to the top rating count when the totals are tied too', () => {
    // totals: 1 -> 6, 2 -> 6; the runoff is tied 2-2
    // top ratings (5): 1 -> 1, 2 -> 0
    const result = tally('star', [1, 2], [
      { 1: 5, 2: 0 },
      { 1: 1, 2: 0 },
      { 1: 0, 2: 3 },
      { 1: 0, 2: 3 },
    ]);

    expect(result.runoff?.tiebreak).toBe('top');
    expect(result.runoff?.winner).toBe(1);
    expect(result.winner).toBe(1);
  });

  it('falls back to the lower id when every rule ties', () => {
    // totals: 1 -> 5, 2 -> 5; top ratings: one each; the runoff is tied 1-1
    const result = tally('star', [1, 2], [
      { 1: 5, 2: 0 },
      { 1: 0, 2: 5 },
    ]);

    expect(result.runoff?.tiebreak).toBe('id');
    expect(result.runoff?.winner).toBe(1);
  });

  it('counts ballots that rank the two finalists equally', () => {
    const result = tally('star', [1, 2], [
      { 1: 3, 2: 3 },
      { 1: 5, 2: 0 },
      { 1: 0, 2: 5 },
    ]);

    expect(result.runoff?.equal).toBe(1);
    expect(result.runoff?.preferA).toBe(1);
    expect(result.runoff?.preferB).toBe(1);
  });
});
