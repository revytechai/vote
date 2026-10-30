# @revytechai/tally

Vote tallying for the revytechai-vote rounds. Pure TypeScript, no runtime
dependencies. Ships an ESM and a CommonJS build, so it can be consumed from a
`"type": "module"` package and from a CommonJS one such as the NestJS API.

```ts
import { tally } from '@revytechai/tally';

const result = tally('score', [11, 12], [
  { 11: 5, 12: 3 },
  { 11: 4, 12: 4 },
]);
```

## API

```ts
tally(
  method: 'star' | 'score' | 'approval',
  candidates: number[],
  ballots: Array<Record<number, number>>,
  opts?: { maxScore?: number },
): TallyResult;
```

`TallyResult`:

| field     | type                              | meaning                                              |
| --------- | --------------------------------- | ---------------------------------------------------- |
| `method`  | `'star' \| 'score' \| 'approval'` | the method that was tallied                           |
| `ballots` | `number`                          | number of ballots counted                             |
| `rows`    | `TallyRow[]`                      | ranking, winner first                                 |
| `runoff`  | `TallyRunoff \| null`             | runoff of a star round, `null` for every other method |
| `winner`  | `number \| null`                  | winning candidate id, `null` when there are none      |

`TallyRow` is `{ id, total, mean, rank }`: the candidate id, the sum of its
scores, the total divided by the number of ballots (0 when there are no
ballots) and the rank (1 is the winner).

`TallyRunoff` is `{ a, b, preferA, preferB, equal, winner, tiebreak }`: the two
finalists, how many ballots preferred each of them, how many scored them
equally, who won and which rule decided it (`'runoff' | 'total' | 'top' | 'id'`).

## Rules

- A candidate that is missing from a ballot scores zero for that ballot. A
  ballot entry that is `null` or `undefined` counts as missing.
- A score outside `0..maxScore` is rejected with a `RangeError`. Approval
  rounds are always `0..1`, whatever `maxScore` is set to.
- A score that is not a number is rejected with a `TypeError`, as are an
  unknown method, a non integer candidate id and a ballot that is not an
  object.
- `score` and `approval` rank by total descending. Ties are broken by the
  number of top ratings (the `maxScore` rating, or `1` for approval)
  descending, then by the lower candidate id.
- `star` runs a scoring round over the two highest ranked candidates, then a
  runoff: every ballot prefers whichever of the two it scored higher. The
  winner is the one with the more preferences. A tied runoff falls back to the
  higher total, then the more top ratings, then the lower candidate id, and
  the rule that decided it is reported in `runoff.tiebreak`.
- Ranks run from 1 to the number of candidates with no gaps. The rows are
  ordered with the winner first; for `star` the runoff winner is ranked 1, the
  runoff loser 2, and the remaining candidates follow in score order.

## Choices the brief left open

- **No candidates** gives `rows: []`, `winner: null` and `runoff: null`.
- **A single candidate** wins the round outright. There is nothing to run off
  against, so `runoff` is `null` even for `star`.
- **No ballots** (or ballots that carry no scores) leaves every candidate on
  zero. The tie-break chain then runs to its end and the lowest candidate id
  wins, so a round with no votes still has a deterministic winner.
- **Duplicate candidate ids** are collapsed onto the first occurrence, so a
  candidate never appears twice in `rows`.
- **Scores for ids that are not candidates** are ignored by the totals but are
  still range checked, so a malformed ballot is rejected rather than silently
  dropped.
- **`maxScore`** must be a positive integer. It is ignored for approval.
- **`mean`** is the total divided by the number of ballots, not by the number
  of ballots that scored the candidate.

## Development

```sh
pnpm -C packages/tally test        # build + vitest
pnpm -C packages/tally typecheck   # tsc --noEmit over src and test
pnpm -C packages/tally build       # tsc -> dist/esm (ESM) and dist/cjs (CommonJS)
```

`dist/esm` is the ESM build and `dist/cjs` the CommonJS one. The CommonJS
build carries its own `package.json` with `"type": "commonjs"`, because the
package itself is `"type": "module"`. The `exports` map points the `import`
condition at the ESM build and the `require` condition at the CommonJS one, and
each condition carries its own types.
