import { describe, expect, it } from 'vitest';

import { tally } from '../src/index.js';

describe('tally result shape', () => {
  it('echoes the method and counts the ballots', () => {
    const result = tally('score', [1, 2], [{ 1: 3 }, { 2: 4 }]);

    expect(result.method).toBe('score');
    expect(result.ballots).toBe(2);
  });

  it('ranks by total descending and reports total, mean and rank', () => {
    const result = tally('score', [1, 2, 3], [
      { 1: 5, 2: 3, 3: 1 },
      { 1: 4, 2: 0, 3: 2 },
    ]);

    expect(result.rows).toEqual([
      { id: 1, total: 9, mean: 4.5, rank: 1 },
      { id: 2, total: 3, mean: 1.5, rank: 2 },
      { id: 3, total: 3, mean: 1.5, rank: 3 },
    ]);
    expect(result.winner).toBe(1);
    expect(result.runoff).toBeNull();
  });

  it('reports ranks 1..n with no gaps', () => {
    const result = tally('score', [4, 8, 15], [{ 4: 1, 8: 2, 15: 3 }]);

    expect(result.rows.map((row) => row.rank)).toEqual([1, 2, 3]);
  });

  it('treats a missing score as zero', () => {
    const result = tally('score', [1, 2], [{ 1: 5 }, { 2: 4 }]);

    expect(result.rows).toEqual([
      { id: 1, total: 5, mean: 2.5, rank: 1 },
      { id: 2, total: 4, mean: 2, rank: 2 },
    ]);
  });

  it('ignores scores for ids that are not candidates', () => {
    const result = tally('score', [1], [{ 1: 2, 99: 5 }]);

    expect(result.rows).toEqual([{ id: 1, total: 2, mean: 2, rank: 1 }]);
  });
});

describe('empty input', () => {
  it('handles an empty ballot list', () => {
    const result = tally('score', [3, 1, 2], []);

    expect(result.ballots).toBe(0);
    expect(result.rows).toEqual([
      { id: 1, total: 0, mean: 0, rank: 1 },
      { id: 2, total: 0, mean: 0, rank: 2 },
      { id: 3, total: 0, mean: 0, rank: 3 },
    ]);
    expect(result.winner).toBe(1);
    expect(result.runoff).toBeNull();
  });

  it('handles a ballot that carries no scores', () => {
    const result = tally('score', [1, 2], [{}]);

    expect(result.ballots).toBe(1);
    expect(result.rows).toEqual([
      { id: 1, total: 0, mean: 0, rank: 1 },
      { id: 2, total: 0, mean: 0, rank: 2 },
    ]);
    expect(result.winner).toBe(1);
  });

  it('handles a single candidate', () => {
    const result = tally('score', [7], [{ 7: 4 }]);

    expect(result.rows).toEqual([{ id: 7, total: 4, mean: 4, rank: 1 }]);
    expect(result.winner).toBe(7);
    expect(result.runoff).toBeNull();
  });

  it('handles no candidates at all', () => {
    const result = tally('score', [], [{ 1: 3 }]);

    expect(result.rows).toEqual([]);
    expect(result.winner).toBeNull();
    expect(result.runoff).toBeNull();
    expect(result.ballots).toBe(1);
  });

  it('collapses duplicate candidate ids', () => {
    const result = tally('score', [1, 1, 2], [{ 1: 3, 2: 1 }]);

    expect(result.rows.map((row) => row.id)).toEqual([1, 2]);
  });
});

describe('approval', () => {
  it('counts approvals and ranks by the number of approvals', () => {
    const result = tally('approval', [1, 2], [
      { 1: 1, 2: 0 },
      { 1: 1, 2: 1 },
      { 1: 0, 2: 1 },
    ]);

    expect(result.rows).toEqual([
      { id: 1, total: 2, mean: 2 / 3, rank: 1 },
      { id: 2, total: 2, mean: 2 / 3, rank: 2 },
    ]);
    expect(result.winner).toBe(1);
  });

  it('ranks the candidate with the most approvals first', () => {
    const result = tally('approval', [10, 20], [
      { 10: 1, 20: 0 },
      { 10: 0, 20: 1 },
      { 10: 0, 20: 1 },
    ]);

    expect(result.rows.map((row) => row.id)).toEqual([20, 10]);
    expect(result.winner).toBe(20);
    expect(result.runoff).toBeNull();
  });
});
