import { AsyncPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, distinctUntilChanged, map, of, switchMap } from 'rxjs';

import { VoteApi } from '../api/vote-api';
import { Submission } from '../api/models';

/** The prizes on the table and who won them. */
@Component({
  selector: 'app-prizes-page',
  imports: [AsyncPipe, RouterLink],
  template: `
    <section class="page" data-testid="prizes-page">
      <header class="page-head">
        <p class="eyebrow">$ cat /etc/prizes</p>
        <h1 data-testid="prizes-title">What is on the table</h1>
        <p class="tagline">Every prize on the table, and who took it home.</p>
      </header>

      @if (error(); as message) {
        <p class="alert alert-error" data-testid="prizes-error">{{ message }}</p>
      } @else if (prizes$ | async; as prizes) {
        <ul class="entry-list" data-testid="prize-list">
          @for (prize of prizes; track prize.id) {
            <li class="entry" data-testid="prize-item">
              <span class="entry-title">{{ prize.name }}</span>
              <p class="entry-summary">{{ prize.description }}</p>
              @if (prize.winnerSubmissionId) {
                <p class="pill" data-testid="prize-winner">Won by {{ titleFor(prize.winnerSubmissionId) }}</p>
              } @else {
                <p class="pill pill-muted" data-testid="prize-not-awarded">Not awarded yet</p>
              }
            </li>
          }
        </ul>

        <div class="form-actions">
          <a class="button button-secondary" [routerLink]="['/e', slug(), 'results']" data-testid="prizes-link-results">
            See the results
          </a>
        </div>
      } @else {
        <p class="muted" data-testid="prizes-loading">Loading the prizes…</p>
      }
    </section>
  `,
})
export class PrizesPage {
  private readonly api = inject(VoteApi);
  private readonly route = inject(ActivatedRoute);

  private readonly slug$ = this.route.paramMap.pipe(
    map((params) => params.get('slug') ?? 'hackathon-2026'),
    distinctUntilChanged(),
  );

  protected readonly prizes$ = this.slug$.pipe(
    switchMap((slug) => this.api.listPrizes(slug)),
    catchError(() => {
      this.error.set('We could not load the prizes.');
      return of([]);
    }),
  );

  protected readonly submissions$ = this.slug$.pipe(
    switchMap((slug) => this.api.listSubmissions(slug)),
    catchError(() => of([] as Submission[])),
  );

  readonly slug = toSignal(this.slug$, { initialValue: 'hackathon-2026' });
  readonly submissions = toSignal(this.submissions$, { initialValue: [] as Submission[] });
  readonly error = signal<string | null>(null);

  protected titleFor(submissionId: number): string {
    const submission = this.submissions().find((candidate) => candidate.id === submissionId);
    return submission ? submission.title : `Submission ${submissionId}`;
  }
}
