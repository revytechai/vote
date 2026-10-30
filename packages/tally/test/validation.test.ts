import { describe, expect, it } from 'vitest';

import { tally } from '../src/index.js';

describe('score range', () => {
  it('rejects a score above the default max score', () => {
    expect(() => tally('score', [1], [{ 1: 6 }])).toThrow(RangeError);
  });

  it('rejects a negative score', () => {
    expect(() => tally('score', [1], [{ 1: -1 }])).toThrow(RangeError);
  });

  it('rejects a score above a custom max score', () => {
    expect(() => tally('score', [1], [{ 1: 11 }], { maxScore: 10 })).toThrow(RangeError);
    expect(() => tally('score', [1], [{ 1: 10 }], { maxScore: 10 })).not.toThrow();
  });

  it('rejects a score above five for star', () => {
    expect(() => tally('star', [1, 2], [{ 1: 6, 2: 1 }])).toThrow(RangeError);
  });

  it('accepts the boundaries of the range', () => {
    expect(() => tally('score', [1], [{ 1: 0 }])).not.toThrow();
    expect(() => tally('score', [1], [{ 1: 5 }])).not.toThrow();
  });

  it('rejects scores outside zero and one for approval', () => {
    expect(() => tally('approval', [1], [{ 1: 2 }])).toThrow(RangeError);
    expect(() => tally('approval', [1], [{ 1: 2 }], { maxScore: 10 })).toThrow(RangeError);
    expect(() => tally('approval', [1], [{ 1: 1 }])).not.toThrow();
    expect(() => tally('approval', [1], [{ 1: 0 }])).not.toThrow();
  });

  it('rejects a score that is not a finite number', () => {
    expect(() => tally('score', [1], [{ 1: Number.NaN }])).toThrow(RangeError);
    expect(() => tally('score', [1], [{ 1: Number.POSITIVE_INFINITY }])).toThrow(RangeError);
  });

  it('rejects a score that is not a number at all', () => {
    const ballot = { 1: '5' } as unknown as Record<number, number>;

    expect(() => tally('score', [1], [ballot])).toThrow(TypeError);
  });
});

describe('input validation', () => {
  it('rejects an unknown method', () => {
    expect(() => tally('rank' as unknown as 'star', [1], [])).toThrow(TypeError);
  });

  it('rejects a max score that is not a positive integer', () => {
    expect(() => tally('score', [1], [{ 1: 1 }], { maxScore: 0 })).toThrow(RangeError);
    expect(() => tally('score', [1], [{ 1: 1 }], { maxScore: -3 })).toThrow(RangeError);
    expect(() => tally('score', [1], [{ 1: 1 }], { maxScore: 2.5 })).toThrow(RangeError);
  });

  it('rejects candidate ids that are not integers', () => {
    expect(() => tally('score', [1.5], [])).toThrow(TypeError);
    expect(() => tally('score', [Number.NaN], [])).toThrow(TypeError);
  });

  it('rejects a ballot that is not an object of scores', () => {
    expect(() => tally('score', [1], [null as unknown as Record<number, number>])).toThrow(TypeError);
    expect(() => tally('score', [1], [[1, 5] as unknown as Record<number, number>])).toThrow(TypeError);
  });
});
