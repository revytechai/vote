import { Injectable } from '@nestjs/common';
import {
  tally,
  TallyMethod,
  TallyOptions,
  TallyResult,
} from '@revytechai/tally';

export interface ApiResultRow {
  submission_id: number;
  title: string;
  total: number;
  mean: number;
  rank: number;
}

export interface ApiRunoff {
  a: number;
  b: number;
  prefer_a: number;
  prefer_b: number;
  equal: number;
  winner: number;
  tiebreak: string;
}

export interface ApiRoundResult {
  round: number;
  method: string;
  ballots: number;
  rows: ApiResultRow[];
  runoff: ApiRunoff | null;
  final: boolean;
}

@Injectable()
export class TallyService {
  computeTally(
    roundId: number,
    method: string,
    isClosed: boolean,
    candidateSubmissions: Array<{ id: number; title: string }>,
    ballots: Array<Record<number, number>>,
    opts?: TallyOptions,
  ): ApiRoundResult {
    const candidateIds = candidateSubmissions.map((c) => c.id);
    const validMethod = (['star', 'score', 'approval'].includes(method)
      ? method
      : 'star') as TallyMethod;

    const tallyResult: TallyResult = tally(
      validMethod,
      candidateIds,
      ballots,
      opts,
    );

    const titleMap = new Map<number, string>(
      candidateSubmissions.map((c) => [c.id, c.title]),
    );

    const rows: ApiResultRow[] = tallyResult.rows.map((row) => ({
      submission_id: row.id,
      title: titleMap.get(row.id) || '',
      total: row.total,
      mean: row.mean,
      rank: row.rank,
    }));

    const runoff: ApiRunoff | null = tallyResult.runoff
      ? {
          a: tallyResult.runoff.a,
          b: tallyResult.runoff.b,
          prefer_a: tallyResult.runoff.preferA,
          prefer_b: tallyResult.runoff.preferB,
          equal: tallyResult.runoff.equal,
          winner: tallyResult.runoff.winner,
          tiebreak: tallyResult.runoff.tiebreak,
        }
      : null;

    return {
      round: roundId,
      method: validMethod,
      ballots: tallyResult.ballots,
      rows,
      runoff,
      final: isClosed,
    };
  }
}
