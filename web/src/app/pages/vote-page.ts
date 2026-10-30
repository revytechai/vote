import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, distinctUntilChanged, map, of, switchMap } from 'rxjs';

import { MOCK_INVITE_CODE, VoteApi } from '../api/vote-api';
import { Submission } from '../api/models';

/** STAR ballot: score every submission from 0 to 5, then send it in. */
@Component({
  selector: 'app-vote-page',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <section class="page" data-testid="vote-page">
      <header class="page-head">
        <p class="eyebrow">STAR ballot</p>
        <h1 data-testid="vote-title">Score the projects</h1>
        <p class="tagline">
          Give every project a score from 0 to 5. The two best totals go to a runoff, and the runoff
          picks the winner.
        </p>
      </header>

      @if (round(); as openRound) {
        <p class="pill" data-testid="vote-round">{{ openRound.name }} — {{ openRound.method }}</p>
      }

      @if (!joined()) {
        <div class="card">
          <h2>Join the event first</h2>
          <p class="prose">
            Only participants who joined the event can vote. Enter the invite code you received by
            email.
          </p>

          <form class="stack" [formGroup]="joinForm" (ngSubmit)="join()" data-testid="join-form">
            <div class="field" [class.invalid]="inviteCodeInvalid()">
              <label for="invite-code">Invite code</label>
              <input
                id="invite-code"
                type="text"
                formControlName="inviteCode"
                autocomplete="off"
                data-testid="invite-code"
              />
              @if (inviteCodeInvalid()) {
                <p class="field-error" data-testid="invite-code-error">An invite code is required.</p>
              }
            </div>
            <div class="form-actions">
              <button type="submit" class="button button-primary" data-testid="join-button">
                Join the event
              </button>
            </div>
          </form>

          @if (joinError(); as message) {
            <p class="alert alert-error" role="alert" data-testid="join-error">{{ message }}</p>
          }
          <p class="hint">Demo build: the invite code is {{ demoInviteCode }}.</p>
        </div>
      } @else {
        <div class="card">
          <h2>You are in</h2>
          <p class="prose">One score per project, from 0 (not for me) to 5 (I want this).</p>
        </div>

        @for (submission of submissions(); track submission.id) {
          <div class="ballot" data-testid="ballot-item">
            <div class="ballot-head">
              <span class="ballot-title">{{ submission.title }}</span>
              <span class="ballot-team">{{ submission.team }}</span>
            </div>
            <div class="score-scale" role="radiogroup" [attr.aria-label]="'Score for ' + submission.title">
              @for (option of scoreOptions; track option) {
                <label
                  class="score-option"
                  [attr.data-testid]="'score-option-' + submission.id + '-' + option"
                >
                  <input
                    type="radio"
                    [name]="'score-' + submission.id"
                    [value]="option"
                    [checked]="scoreFor(submission.id) === option"
                    (change)="setScore(submission.id, option)"
                    [attr.data-testid]="'score-' + submission.id + '-' + option"
                  />
                  <span>{{ option }}</span>
                </label>
              }
            </div>
            <div class="scale-legend">
              <span>0 — not for me</span>
              <span>5 — I want this</span>
            </div>
          </div>
        }

        @if (ballotError(); as message) {
          <p class="alert alert-error" role="alert" data-testid="ballot-error">{{ message }}</p>
        }

        @if (confirmed()) {
          <p class="alert alert-success" role="status" data-testid="ballot-confirmation">
            Your ballot is in. Thanks for voting.
          </p>
        }

        <div class="form-actions">
          <button type="button" class="button button-primary" (click)="submitBallot()" data-testid="cast-ballot">
            Send my ballot
          </button>
          <a class="button button-secondary" [routerLink]="['/e', slug(), 'results']" data-testid="vote-link-results">
            See the results
          </a>
        </div>
      }
    </section>
  `,
})
export class VotePage {
  private readonly api = inject(VoteApi);
  private readonly route = inject(ActivatedRoute);

  private readonly slug$ = this.route.paramMap.pipe(
    map((params) => params.get('slug') ?? 'hackathon-2026'),
    distinctUntilChanged(),
  );

  private readonly round$ = this.slug$.pipe(
    switchMap((slug) => this.api.listRounds(slug)),
    map((rounds) => rounds.find((round) => round.status === 'open') ?? rounds[0] ?? null),
    catchError(() => of(null)),
  );

  private readonly submissions$ = this.slug$.pipe(
    switchMap((slug) => this.api.listSubmissions(slug)),
    catchError(() => of([] as Submission[])),
  );

  readonly slug = toSignal(this.slug$, { initialValue: 'hackathon-2026' });
  readonly round = toSignal(this.round$, { initialValue: null });
  readonly submissions = toSignal(this.submissions$, { initialValue: [] as Submission[] });

  /** True once the visitor joined the event with a valid invite code. */
  readonly joined = signal(false);
  readonly joinError = signal<string | null>(null);
  readonly ballotError = signal<string | null>(null);
  readonly confirmed = signal(false);
  /** Scores picked so far, keyed by submission id. */
  readonly scores = signal<Record<number, number>>({});
  readonly scoreOptions = [0, 1, 2, 3, 4, 5];
  readonly demoInviteCode = MOCK_INVITE_CODE;

  readonly joinForm = new FormGroup({
    inviteCode: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  protected inviteCodeInvalid(): boolean {
    const control = this.joinForm.controls.inviteCode;
    return control.touched && control.invalid;
  }

  protected join(): void {
    if (this.joinForm.invalid) {
      this.joinForm.markAllAsTouched();
      return;
    }
    const inviteCode = this.joinForm.getRawValue().inviteCode;
    this.joinError.set(null);

    this.api.join(this.slug(), inviteCode).subscribe({
      next: () => {
        this.joined.set(true);
        this.joinForm.reset();
        this.prefillBallot();
      },
      error: (error: unknown) => {
        this.joinError.set(
          error instanceof Error ? error.message : 'We could not join that event.',
        );
      },
    });
  }

  protected setScore(submissionId: number, score: number): void {
    this.scores.update((current) => ({ ...current, [submissionId]: score }));
    this.ballotError.set(null);
  }

  protected scoreFor(submissionId: number): number | null {
    return this.scores()[submissionId] ?? null;
  }

  protected submitBallot(): void {
    const round = this.round();
    const submissions = this.submissions();

    if (!round) {
      this.ballotError.set('There is no open round to vote in right now.');
      return;
    }

    const scores: Record<number, number> = {};
    const missing: string[] = [];
    for (const submission of submissions) {
      const score = this.scores()[submission.id];
      if (score === undefined) {
        missing.push(submission.title);
        continue;
      }
      scores[submission.id] = score;
    }

    if (missing.length > 0) {
      this.ballotError.set(`Score every project before sending your ballot: ${missing.join(', ')}.`);
      return;
    }

    this.api.castBallot(round.id, { scores }).subscribe({
      next: () => {
        this.confirmed.set(true);
        this.ballotError.set(null);
      },
      error: (error: unknown) => {
        this.ballotError.set(
          error instanceof Error ? error.message : 'Your ballot could not be sent.',
        );
      },
    });
  }

  /** GET /rounds/{id}/ballot: show the visitor's saved scores so a ballot can be replaced. */
  protected prefillBallot(): void {
    const round = this.round();
    if (!round) {
      return;
    }
    this.api.getBallot(round.id).subscribe({
      next: (ballot) => this.scores.set({ ...ballot?.scores }),
      error: () => undefined,
    });
  }
}
