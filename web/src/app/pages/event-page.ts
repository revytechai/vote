import { AsyncPipe, DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, distinctUntilChanged, map, of, switchMap, tap } from 'rxjs';

import { VoteApi } from '../api/vote-api';

/** Landing page of an event: what it is, when it runs and where to go next. */
@Component({
  selector: 'app-event-page',
  imports: [AsyncPipe, DatePipe, RouterLink],
  template: `
    <section class="page" data-testid="event-page">
      @if (error(); as message) {
        <p class="alert alert-error" data-testid="event-error">{{ message }}</p>
      } @else if (event$ | async; as event) {
        <header class="page-head">
          <p class="eyebrow" data-testid="event-status">{{ event.status }}</p>
          <h1 data-testid="event-title">{{ event.name }}</h1>
          <p class="tagline" data-testid="event-tagline">{{ event.tagline }}</p>
        </header>

        <div class="card">
          <dl class="meta-list">
            <div>
              <dt>Starts</dt>
              <dd data-testid="event-starts">{{ event.startsAt | date: 'medium' }}</dd>
            </div>
            <div>
              <dt>Ends</dt>
              <dd data-testid="event-ends">{{ event.endsAt | date: 'medium' }}</dd>
            </div>
            <div>
              <dt>Location</dt>
              <dd data-testid="event-location">{{ event.location }}</dd>
            </div>
          </dl>
          <p class="prose" data-testid="event-description">{{ event.description }}</p>
        </div>

        <h2>Take part</h2>
        <nav class="action-grid" aria-label="Event actions">
          <a class="action-card" [routerLink]="['/e', slug(), 'submissions']" data-testid="event-link-submissions">
            <strong>Browse the submissions</strong>
            <span>Every approved project, with links to the demo and the source.</span>
          </a>
          <a class="action-card" [routerLink]="['/e', slug(), 'vote']" data-testid="event-link-vote">
            <strong>Cast your vote</strong>
            <span>Score every project from 0 to 5 with STAR.</span>
          </a>
          <a class="action-card" [routerLink]="['/e', slug(), 'results']" data-testid="event-link-results">
            <strong>Watch the results</strong>
            <span>Live score bars, the runoff and the winner.</span>
          </a>
          <a class="action-card" [routerLink]="['/e', slug(), 'prizes']" data-testid="event-link-prizes">
            <strong>See the prizes</strong>
            <span>What is on the table and who took it home.</span>
          </a>
          <a class="action-card" [routerLink]="['/e', slug(), 'register']" data-testid="event-link-register">
            <strong>Register</strong>
            <span>Tell us you are coming and who you are with.</span>
          </a>
          <a class="action-card" [routerLink]="['/e', slug(), 'submit']" data-testid="event-link-submit">
            <strong>Submit a project</strong>
            <span>Put your hack on the ballot, with links to your work.</span>
          </a>
        </nav>
      } @else {
        <p class="muted" data-testid="event-loading">Loading the event…</p>
      }
    </section>
  `,
})
export class EventPage {
  private readonly api = inject(VoteApi);
  private readonly route = inject(ActivatedRoute);

  private readonly slug$ = this.route.paramMap.pipe(
    map((params) => params.get('slug') ?? 'hackathon-2026'),
    distinctUntilChanged(),
  );

  /** Slug of the event currently being shown. */
  readonly slug = toSignal(this.slug$, { initialValue: 'hackathon-2026' });
  /** Set when the event cannot be loaded. */
  readonly error = signal<string | null>(null);

  readonly event$ = this.slug$.pipe(
    tap(() => this.error.set(null)),
    switchMap((slug) =>
      this.api.getEvent(slug).pipe(
        catchError(() => {
          this.error.set('We could not load this event. It may have moved or closed.');
          return of(null);
        }),
      ),
    ),
  );
}
