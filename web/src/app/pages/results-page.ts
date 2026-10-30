import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, distinctUntilChanged, EMPTY, map, of, switchMap, tap } from 'rxjs';

import { VoteApi } from '../api/vote-api';
import { Prize, Result } from '../api/models';

/** Live results: score bars, the runoff and the winner. */
@Component({
  selector: 'app-results-page',
  imports: [RouterLink],
  template: `
    <section class="page" data-testid="results-page">
      <header class="page-head">
        <p class="eyebrow">$ zpool status --live</p>
        <h1 data-testid="results-title">How the projects scored</h1>
        <p class="tagline">
          Scores land as ballots arrive. The two best totals go to a runoff, and the runoff picks the
          winner.
        </p>
      </header>

      @if (live()) {
        <p class="pill" data-testid="results-live"><span class="live-dot" aria-hidden="true"></span>Live</p>
      }

      @if (streamError(); as message) {
        <p class="alert alert-error" role="alert" data-testid="results-error">{{ message }}</p>
        <div class="form-actions">
          <button type="button" class="button button-secondary" (click)="refresh()" data-testid="results-refresh">
            Refresh results
          </button>
        </div>
      }

      @if (results(); as result) {
        @if (winnerId(result); as winner) {
          <p class="alert alert-success" role="status" data-testid="results-winner">
            {{ result.final ? 'Winner' : 'Leading' }}: {{ titleFor(result, winner) }}
          </p>
        }
        <p class="muted" data-testid="results-ballots">
          {{ result.ballots }} {{ result.ballots === 1 ? 'ballot' : 'ballots' }} counted ·
          {{ result.final ? 'Final results' : 'Voting is open' }}
        </p>

        <div class="card">
          <h2>Score phase</h2>
          @if (result.rows.length === 0) {
            <p class="muted" data-testid="results-empty">No scores yet. They will appear here as ballots arrive.</p>
          }
          <div class="stack">
            @for (row of result.rows; track row.submission_id) {
              <div class="score-row" data-testid="score-row">
                <div class="score-label">
                  <strong>#{{ row.rank }} {{ row.title }}</strong>
                  <span class="muted">{{ row.total }} points · average {{ row.mean }} / 5</span>
                </div>
                <div class="score-track">
                  <div
                    class="score-fill"
                    [class.is-winner]="row.submission_id === winnerId(result)"
                    [style.width.%]="barWidth(row.total, result)"
                  ></div>
                </div>
              </div>
            }
          </div>
        </div>

        @if (result.runoff; as runoff) {
          <div class="card">
            <h2>Runoff</h2>
            <div class="runoff">
              <div class="runoff-side" [class.is-winner]="runoff.winner === runoff.a" data-testid="runoff-a">
                <div class="runoff-count">{{ runoff.prefer_a ?? 0 }}</div>
                <div>{{ titleFor(result, runoff.a) }}</div>
              </div>
              <div class="runoff-side" [class.is-winner]="runoff.winner === runoff.b" data-testid="runoff-b">
                <div class="runoff-count">{{ runoff.prefer_b ?? 0 }}</div>
                <div>{{ titleFor(result, runoff.b) }}</div>
              </div>
            </div>
            <p class="muted" data-testid="runoff-summary">
              {{ runoff.prefer_a ?? 0 }} preferred {{ titleFor(result, runoff.a) }}, {{ runoff.prefer_b ?? 0 }}
              preferred {{ titleFor(result, runoff.b) }}, {{ runoff.equal ?? 0 }} had no preference.
              @if (runoff.tiebreak) { Tiebreak: {{ runoff.tiebreak }}. }
            </p>
          </div>
        } @else if (result.rows.length > 0) {
          <div class="card">
            <h2>Runoff</h2>
            <p class="muted" data-testid="runoff-empty">The runoff between the top two starts once enough ballots are in.</p>
          </div>
        }

        <div class="card" data-testid="results-prizes">
          <h2>Prizes and winners</h2>
          @if (prizes().length === 0) {
            <p class="muted" data-testid="results-prizes-empty">Prizes will be announced soon.</p>
          } @else {
            <ul class="entry-list">
              @for (prize of prizes(); track prize.id) {
                <li class="entry" data-testid="results-prize">
                  <span class="entry-title">{{ prize.name }}</span>
                  <p class="entry-summary">{{ prize.description }}</p>
                  @if (prize.winnerSubmissionId) {
                    <p class="pill" data-testid="results-prize-winner">Won by {{ titleFor(result, prize.winnerSubmissionId) }}</p>
                  } @else {
                    <p class="pill pill-muted">Not awarded yet</p>
                  }
                </li>
              }
            </ul>
          }
        </div>

        <div class="form-actions">
          <a class="button button-secondary" [routerLink]="['/e', slug(), 'prizes']" data-testid="results-link-prizes">
            See the prizes
          </a>
          <a class="button button-secondary" [routerLink]="['/e', slug(), 'vote']" data-testid="results-link-vote">
            Cast your vote
          </a>
        </div>
      } @else {
        <p class="muted" data-testid="results-loading">Waiting for the first scores…</p>
      }
    </section>
  `,
})
export class ResultsPage {
  private readonly api = inject(VoteApi);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  private readonly slug$ = this.route.paramMap.pipe(
    map((params) => params.get('slug') ?? 'hackathon-2026'),
    distinctUntilChanged(),
  );

  private readonly round$ = this.slug$.pipe(
    switchMap((slug) => this.api.listRounds(slug)),
    map((rounds) => rounds.find((round) => round.status === 'open') ?? rounds[0] ?? null),
    catchError(() => of(null)),
  );

  readonly slug = toSignal(this.slug$, { initialValue: 'hackathon-2026' });
  readonly round = toSignal(this.round$, { initialValue: null });
  /** Prizes from the API; winners are whatever the API reports (never computed here). */
  readonly prizes = toSignal(
    this.slug$.pipe(
      switchMap((slug) => this.api.listPrizes(slug)),
      catchError(() => of([] as Prize[])),
    ),
    { initialValue: [] as Prize[] },
  );

  /** Latest results pushed by the live stream. */
  readonly results = signal<Result | null>(null);
  /** True while the stream is connected. */
  readonly live = signal(false);
  readonly streamError = signal<string | null>(null);

  private readonly results$ = this.round$.pipe(
    switchMap((round) => {
      if (!round) {
        this.streamError.set('There is no round to show results for.');
        return EMPTY;
      }
      return this.api.streamResults(round.id).pipe(
        tap((results) => {
          this.results.set(results);
          this.live.set(true);
          this.streamError.set(null);
        }),
        catchError(() => {
          this.live.set(false);
          this.streamError.set('The live feed dropped. Refresh to load the latest scores.');
          return EMPTY;
        }),
      );
    }),
  );

  constructor() {
    this.results$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
  }

  /** Winner as reported by the API: the runoff winner, else the rank-1 row. Never tallied here. */
  protected winnerId(result: Result): number | null {
    return result.runoff?.winner ?? result.rows.find((row) => row.rank === 1)?.submission_id ?? null;
  }

  protected titleFor(result: Result, submissionId: number | undefined): string {
    if (!submissionId) {
      return 'No submission';
    }
    return result.rows.find((row) => row.submission_id === submissionId)?.title ?? `Submission ${submissionId}`;
  }

  protected barWidth(total: number, result: Result): number {
    const max = result.rows.reduce((highest, row) => Math.max(highest, row.total), 0);
    return max <= 0 ? 0 : Math.round((total / max) * 100);
  }

  protected refresh(): void {
    const round = this.round();
    if (!round) {
      return;
    }
    this.api.getResults(round.id).subscribe({
      next: (results) => {
        this.results.set(results);
        this.streamError.set(null);
      },
      error: () => this.streamError.set('The results could not be loaded.'),
    });
  }
}
