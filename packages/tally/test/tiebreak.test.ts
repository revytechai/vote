import { describe, expect, it } from 'vitest';

import { tally } from '../src/index.js';

describe('score tie-breaks', () => {
  it('breaks a tie on totals with the number of top ratings', () => {
    // totals: 20 -> 7, 10 -> 7
    // top ratings (5): 20 -> 1, 10 -> 0
    const result = tally('score', [20, 10], [
      { 20: 5, 10: 0 },
      { 20: 2, 10: 3 },
      { 20: 0, 10: 4 },
    ]);

    expect(result.rows.map((row) => row.id)).toEqual([20, 10]);
    expect(result.winner).toBe(20);
  });

  it('breaks a tie on totals and top ratings with the lower id', () => {
    // totals: 20 -> 5, 10 -> 5; top ratings: one each
    const result = tally('score', [20, 10], [
      { 20: 5, 10: 0 },
      { 20: 0, 10: 5 },
    ]);

    expect(result.rows.map((row) => row.id)).toEqual([10, 20]);
    expect(result.rows.map((row) => row.rank)).toEqual([1, 2]);
    expect(result.winner).toBe(10);
  });

  it('uses the configured max score as the top rating', () => {
    // totals: 10 -> 10, 20 -> 10; top ratings (10): 10 -> 1, 20 -> 0
    const result = tally(
      'score',
      [10, 20],
      [
        { 10: 10, 20: 0 },
        { 10: 0, 20: 5 },
        { 10: 0, 20: 5 },
      ],
      { maxScore: 10 },
    );

    expect(result.rows.map((row) => row.id)).toEqual([10, 20]);
    expect(result.winner).toBe(10);
  });

  it('keeps the tie-break chain inside the score order', () => {
    const result = tally('score', [3, 1, 2], [
      { 1: 5, 2: 5, 3: 5 },
      { 1: 4, 2: 4, 3: 0 },
    ]);

    // totals: 1 -> 9, 2 -> 9, 3 -> 5; top ratings: 1 -> 1, 2 -> 1
    expect(result.rows.map((row) => row.id)).toEqual([1, 2, 3]);
  });
});
