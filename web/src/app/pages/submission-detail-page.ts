import { AsyncPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, distinctUntilChanged, map, of, switchMap, tap } from 'rxjs';

import { VoteApi } from '../api/vote-api';

/** One submission, with every artifact link the team published. */
@Component({
  selector: 'app-submission-detail-page',
  imports: [AsyncPipe, RouterLink],
  template: `
    <section class="page" data-testid="submission-detail-page">
      @if (error(); as message) {
        <p class="alert alert-error" data-testid="submission-error">{{ message }}</p>
        <a class="button button-secondary" routerLink="/e/hackathon-2026/submissions">Back to submissions</a>
      } @else if (submission$ | async; as submission) {
        <header class="page-head">
          <p class="eyebrow">{{ submission.team }}</p>
          <h1 data-testid="submission-title">{{ submission.title }}</h1>
          <p class="tagline" data-testid="submission-summary">{{ submission.summary }}</p>
        </header>

        <div class="card">
          <h2>About this project</h2>
          <p class="prose" data-testid="submission-description">{{ submission.description }}</p>
        </div>

        <div class="card">
          <h2>Links</h2>
          @if (submission.artifacts.length === 0) {
            <p class="muted" data-testid="submission-no-artifacts">
              This team has not published any links yet.
            </p>
          } @else {
            <ul class="artifact-list" data-testid="artifact-list">
              @for (artifact of submission.artifacts; track artifact.url) {
                <li>
                  <a
                    class="artifact-link"
                    [href]="artifact.url"
                    target="_blank"
                    rel="noopener"
                    [attr.data-testid]="'artifact-link-' + $index"
                  >
                    <span>
                      {{ artifact.label }}
                      <span class="artifact-url">{{ artifact.url }}</span>
                    </span>
                    <span aria-hidden="true">↗</span>
                  </a>
                </li>
              }
            </ul>
          }
        </div>

        <a class="button button-secondary" routerLink="/e/hackathon-2026/submissions" data-testid="back-to-submissions">
          Back to submissions
        </a>
      } @else {
        <p class="muted" data-testid="submission-loading">Loading the submission…</p>
      }
    </section>
  `,
})
export class SubmissionDetailPage {
  private readonly api = inject(VoteApi);
  private readonly route = inject(ActivatedRoute);

  private readonly id$ = this.route.paramMap.pipe(
    map((params) => Number(params.get('id') ?? 0)),
    distinctUntilChanged(),
  );

  readonly error = signal<string | null>(null);

  readonly submission$ = this.id$.pipe(
    tap(() => this.error.set(null)),
    switchMap((id) =>
      this.api.getSubmission(id).pipe(
        catchError(() => {
          this.error.set('That submission could not be found.');
          return of(null);
        }),
      ),
    ),
  );
}
