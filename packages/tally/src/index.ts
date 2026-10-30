/**
 * Vote tallying for star, score and approval rounds.
 *
 * The module is deliberately dependency free and side effect free: it takes the
 * candidate ids and the ballots and returns the ranking. It is used by the API
 * to publish round results, so every rule below is deterministic and every tie
 * is broken by a documented, ordered chain.
 *
 * Rules:
 *
 * - A candidate that is missing from a ballot scores zero for that ballot.
 * - A score outside `0..maxScore` (approval: `0..1`) is rejected with a
 *   `RangeError`; a score that is not a number at all is rejected with a
 *   `TypeError`.
 * - `score` and `approval` rank by total descending. Ties are broken by the
 *   number of top ratings (the `maxScore` rating, or `1` for approval)
 *   descending, then by the lower candidate id.
 * - `star` runs a scoring round over the two highest ranked candidates and then
 *   a runoff: every ballot prefers whichever of the two it scored higher. The
 *   winner is the one with the more preferences. Ties fall back to the higher
 *   total, then the more top ratings, then the lower candidate id. The rule
 *   that decided the runoff is reported in `runoff.tiebreak`.
 * - Ranks run from 1 to the number of candidates with no gaps. The rows are
 *   ordered with the winner first; for `star` the runoff winner is ranked 1,
 *   the runoff loser 2 and the remaining candidates follow in score order.
 */

export type TallyMethod = 'star' | 'score' | 'approval';

/** The rule that decided a runoff. */
export type TiebreakRule = 'runoff' | 'total' | 'top' | 'id';

export interface TallyOptions {
  /**
   * Highest score a ballot may carry. Defaults to 5. Approval rounds are
   * always `0..1`, whatever this is set to.
   */
  maxScore?: number | undefined;
}

export interface TallyRow {
  /** Candidate id. */
  id: number;
  /** Sum of the scores the candidate received. */
  total: number;
  /** Total divided by the number of ballots; 0 when there are no ballots. */
  mean: number;
  /** 1 is the winner, then 2, 3 and so on. */
  rank: number;
}

export interface TallyRunoff {
  /** Finalist with the higher score order rank. */
  a: number;
  /** Other finalist. */
  b: number;
  /** Ballots that scored `a` higher than `b`. */
  preferA: number;
  /** Ballots that scored `b` higher than `a`. */
  preferB: number;
  /** Ballots that scored the two finalists equally. */
  equal: number;
  /** Candidate that won the runoff. */
  winner: number;
  /** Rule that decided the runoff. */
  tiebreak: TiebreakRule;
}

export interface TallyResult {
  method: TallyMethod;
  /** Number of ballots counted. */
  ballots: number;
  /** Ranking, winner first. */
  rows: TallyRow[];
  /** Runoff of a star round, `null` for every other method. */
  runoff: TallyRunoff | null;
  /** Winning candidate id, `null` when there are no candidates. */
  winner: number | null;
}

const DEFAULT_MAX_SCORE = 5;
const APPROVAL_MAX_SCORE = 1;
const METHODS: ReadonlySet<TallyMethod> = new Set(['star', 'score', 'approval']);

interface CandidateScore {
  id: number;
  total: number;
  /** Number of ballots that gave the candidate the top rating. */
  tops: number;
}

/**
 * Tally a round.
 *
 * @param method - `star`, `score` or `approval`.
 * @param candidates - Candidate ids. Duplicates are collapsed onto the first
 *   occurrence.
 * @param ballots - Ballots as a map of candidate id to score. A missing score
 *   counts as zero.
 * @param opts - Options, currently only the maximum score of a ballot.
 * @throws {RangeError} When a score is outside the allowed range or when
 *   `maxScore` is not a positive integer.
 * @throws {TypeError} When the method, a candidate id, a ballot or a score has
 *   the wrong type.
 */
export function tally(
  method: TallyMethod,
  candidates: number[],
  ballots: Array<Record<number, number>>,
  opts: TallyOptions = {},
): TallyResult {
  if (!METHODS.has(method)) {
    throw new TypeError(`unknown tally method: ${String(method)}`);
  }

  const ids = normalizeCandidates(candidates);
  const maxScore = resolveMaxScore(method, opts);
  const ballotList = normalizeBallots(ballots);
  validateBallots(ballotList, maxScore);

  const scored = scoreCandidates(ids, ballotList, maxScore);
  const ordered = [...scored].sort(compareScoreOrder);

  if (method === 'star') {
    return starResult(method, ordered, ballotList);
  }

  return rankedResult(method, ordered, ballotList.length);
}

function normalizeCandidates(candidates: number[]): number[] {
  if (!Array.isArray(candidates)) {
    throw new TypeError('candidates must be an array of candidate ids');
  }

  const seen = new Set<number>();
  const ids: number[] = [];

  for (const candidate of candidates) {
    if (typeof candidate !== 'number' || !Number.isInteger(candidate)) {
      throw new TypeError(`candidate id must be an integer: ${String(candidate)}`);
    }
    if (seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    ids.push(candidate);
  }

  return ids;
}

function resolveMaxScore(method: TallyMethod, opts: TallyOptions): number {
  if (method === 'approval') {
    return APPROVAL_MAX_SCORE;
  }

  const maxScore = opts.maxScore ?? DEFAULT_MAX_SCORE;
  if (typeof maxScore !== 'number' || !Number.isInteger(maxScore) || maxScore < 1) {
    throw new RangeError(`maxScore must be a positive integer: ${String(maxScore)}`);
  }

  return maxScore;
}

function normalizeBallots(ballots: Array<Record<number, number>>): Array<Record<number, number>> {
  if (!Array.isArray(ballots)) {
    throw new TypeError('ballots must be an array of ballots');
  }

  for (const ballot of ballots) {
    if (typeof ballot !== 'object' || ballot === null || Array.isArray(ballot)) {
      throw new TypeError('each ballot must be an object of candidate id to score');
    }
  }

  return ballots;
}

function validateBallots(ballots: Array<Record<number, number>>, maxScore: number): void {
  for (const ballot of ballots) {
    for (const [key, value] of Object.entries(ballot as unknown as Record<string, unknown>)) {
      if (value === undefined || value === null) {
        // Not scored on this ballot: the candidate counts as zero.
        continue;
      }
      if (typeof value !== 'number') {
        throw new TypeError(`ballot score for candidate ${key} must be a number`);
      }
      if (!Number.isFinite(value) || value < 0 || value > maxScore) {
        throw new RangeError(
          `ballot score for candidate ${key} must be between 0 and ${maxScore}: ${String(value)}`,
        );
      }
    }
  }
}

function scoreCandidates(
  ids: number[],
  ballots: Array<Record<number, number>>,
  maxScore: number,
): CandidateScore[] {
  const byId = new Map<number, CandidateScore>();
  for (const id of ids) {
    byId.set(id, { id, total: 0, tops: 0 });
  }

  for (const ballot of ballots) {
    for (const candidate of byId.values()) {
      const value = ballot[candidate.id] ?? 0;
      candidate.total += value;
      if (value === maxScore) {
        candidate.tops += 1;
      }
    }
  }

  return [...byId.values()];
}

/** Score order: total descending, top ratings descending, id ascending. */
function compareScoreOrder(left: CandidateScore, right: CandidateScore): number {
  if (left.total !== right.total) {
    return right.total - left.total;
  }
  if (left.tops !== right.tops) {
    return right.tops - left.tops;
  }
  return left.id - right.id;
}

function rankedResult(method: TallyMethod, ordered: CandidateScore[], ballotCount: number): TallyResult {
  const rows: TallyRow[] = ordered.map((candidate, index) => toRow(candidate, index + 1, ballotCount));

  return {
    method,
    ballots: ballotCount,
    rows,
    runoff: null,
    winner: rows[0]?.id ?? null,
  };
}

function starResult(
  method: TallyMethod,
  ordered: CandidateScore[],
  ballots: Array<Record<number, number>>,
): TallyResult {
  const ballotCount = ballots.length;
  const [a, b, ...rest] = ordered;

  if (a === undefined || b === undefined) {
    // A single candidate cannot face a runoff, it simply wins.
    const rows: TallyRow[] = a === undefined ? [] : [toRow(a, 1, ballotCount)];
    return {
      method,
      ballots: ballotCount,
      rows,
      runoff: null,
      winner: rows[0]?.id ?? null,
    };
  }

  const runoff = runRunoff(a, b, ballots);
  const winner = runoff.winner;
  const winnerCandidate = winner === a.id ? a : b;
  const loserCandidate = winner === a.id ? b : a;
  const ranked = [winnerCandidate, loserCandidate, ...rest];
  const rows: TallyRow[] = ranked.map((candidate, index) => toRow(candidate, index + 1, ballotCount));

  return {
    method,
    ballots: ballotCount,
    rows,
    runoff,
    winner,
  };
}

function runRunoff(
  a: CandidateScore,
  b: CandidateScore,
  ballots: Array<Record<number, number>>,
): TallyRunoff {
  let preferA = 0;
  let preferB = 0;
  let equal = 0;

  for (const ballot of ballots) {
    const scoreA = ballot[a.id] ?? 0;
    const scoreB = ballot[b.id] ?? 0;
    if (scoreA > scoreB) {
      preferA += 1;
    } else if (scoreB > scoreA) {
      preferB += 1;
    } else {
      equal += 1;
    }
  }

  let winner: number;
  let tiebreak: TiebreakRule;

  if (preferA > preferB) {
    winner = a.id;
    tiebreak = 'runoff';
  } else if (preferB > preferA) {
    winner = b.id;
    tiebreak = 'runoff';
  } else if (a.total !== b.total) {
    winner = a.total > b.total ? a.id : b.id;
    tiebreak = 'total';
  } else if (a.tops !== b.tops) {
    winner = a.tops > b.tops ? a.id : b.id;
    tiebreak = 'top';
  } else {
    winner = Math.min(a.id, b.id);
    tiebreak = 'id';
  }

  return { a: a.id, b: b.id, preferA, preferB, equal, winner, tiebreak };
}

function toRow(candidate: CandidateScore, rank: number, ballotCount: number): TallyRow {
  return {
    id: candidate.id,
    total: candidate.total,
    mean: ballotCount > 0 ? candidate.total / ballotCount : 0,
    rank,
  };
}
