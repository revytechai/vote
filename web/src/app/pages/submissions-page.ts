import { AsyncPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, distinctUntilChanged, map, of, switchMap, tap } from 'rxjs';

import { VoteApi } from '../api/vote-api';

/** List of the approved submissions taking part in the event. */
@Component({
  selector: 'app-submissions-page',
  imports: [AsyncPipe, RouterLink],
  template: `
    <section class="page" data-testid="submissions-page">
      <header class="page-head">
        <p class="eyebrow">Submissions</p>
        <h1 data-testid="submissions-title">What the teams built</h1>
        <p class="tagline">
          Only approved submissions are listed. Open one to watch the demo and read the write-up.
        </p>
      </header>

      @if (error(); as message) {
        <p class="alert alert-error" data-testid="submissions-error">{{ message }}</p>
      } @else if (submissions$ | async; as submissions) {
        @if (submissions.length === 0) {
          <p class="alert alert-info" data-testid="submissions-empty">
            No submissions have been approved yet.
          </p>
        } @else {
          <ul class="entry-list" data-testid="submission-list">
            @for (submission of submissions; track submission.id) {
              <li class="entry" data-testid="submission-item">
                <span class="entry-title">{{ submission.title }}</span>
                <span class="entry-team">{{ submission.team }}</span>
                <p class="entry-summary">{{ submission.summary }}</p>
                <a class="entry-link" [routerLink]="['/s', submission.id]" data-testid="submission-link">
                  View submission
                </a>
              </li>
            }
          </ul>
        }
      } @else {
        <p class="muted" data-testid="submissions-loading">Loading the submissions…</p>
      }
    </section>
  `,
})
export class SubmissionsPage {
  private readonly api = inject(VoteApi);
  private readonly route = inject(ActivatedRoute);

  private readonly slug$ = this.route.paramMap.pipe(
    map((params) => params.get('slug') ?? 'hackathon-2026'),
    distinctUntilChanged(),
  );

  readonly slug = toSignal(this.slug$, { initialValue: 'hackathon-2026' });
  readonly error = signal<string | null>(null);

  readonly submissions$ = this.slug$.pipe(
    tap(() => this.error.set(null)),
    switchMap((slug) =>
      this.api.listSubmissions(slug).pipe(
        catchError(() => {
          this.error.set('We could not load the submissions.');
          return of([]);
        }),
      ),
    ),
  );
}
