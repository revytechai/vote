import { RegisterRequest } from '../api/models';
import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { distinctUntilChanged, map } from 'rxjs';

import { VoteApi } from '../api/vote-api';

/** Sign-up form for an event. */
@Component({
  selector: 'app-register-page',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <section class="page" data-testid="register-page">
      <header class="page-head">
        <p class="eyebrow">Register</p>
        <h1 data-testid="register-title">Come to the hackathon</h1>
        <p class="tagline">Tell us who you are. We only use this to send you the invite code.</p>
      </header>

      @if (registered()) {
        <p class="alert alert-success" role="status" data-testid="register-success">
          You are registered. Check your inbox for the invite code.
        </p>
        <div class="form-actions">
          <a class="button button-primary" [routerLink]="['/e', slug(), 'vote']" data-testid="register-link-vote">
            Go to the ballot
          </a>
          <a
            class="button button-secondary"
            [routerLink]="['/e', slug(), 'submit']"
            data-testid="register-link-submit"
          >
            Submit a project
          </a>
        </div>
      } @else {
        <form class="card stack" [formGroup]="form" (ngSubmit)="register()" novalidate data-testid="register-form">
          <div class="form-grid">
            <div class="field" [class.invalid]="invalid('handle')">
              <label for="handle">Handle</label>
              <input id="handle" type="text" formControlName="handle" autocomplete="username" data-testid="register-handle" />
              @if (invalid('handle')) {
                <p class="field-error" data-testid="register-handle-error">
                  Pick a handle — at least two characters.
                </p>
              }
            </div>

            <div class="field" [class.invalid]="invalid('email')">
              <label for="email">Email</label>
              <input
                id="email"
                type="email"
                formControlName="email"
                autocomplete="email"
                data-testid="register-email"
              />
              @if (invalid('email')) {
                <p class="field-error" data-testid="register-email-error">
                  Give us an email address we can send the invite code to.
                </p>
              }
            </div>

            <div class="field">
              <label for="password">Password (optional)</label>
              <input
                id="password"
                type="password"
                formControlName="password"
                autocomplete="new-password"
                data-testid="register-password"
              />
            </div>

            <div class="field field-wide">
              <label for="team">Team (optional)</label>
              <input
                id="team"
                type="text"
                formControlName="team"
                autocomplete="organization"
                data-testid="register-team"
              />
              <p class="hint">Leave it empty if you have not found a team yet.</p>
            </div>
          </div>

          @if (error(); as message) {
            <p class="alert alert-error" role="alert" data-testid="register-error">{{ message }}</p>
          }

          <div class="form-actions">
            <button type="submit" class="button button-primary" data-testid="register-submit">Register</button>
          </div>
        </form>
      }
    </section>
  `,
})
export class RegisterPage {
  private readonly api = inject(VoteApi);
  private readonly route = inject(ActivatedRoute);

  private readonly slug$ = this.route.paramMap.pipe(
    map((params) => params.get('slug') ?? 'hackathon-2026'),
    distinctUntilChanged(),
  );

  readonly slug = toSignal(this.slug$, { initialValue: 'hackathon-2026' });
  readonly registered = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = new FormGroup({
    handle: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    }),
    password: new FormControl('', { nonNullable: true }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    team: new FormControl('', { nonNullable: true }),
  });

  protected invalid(controlName: 'handle' | 'email' | 'password' | 'team'): boolean {
    const control = this.form.controls[controlName];
    return control.touched && control.invalid;
  }

  protected register(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const registration: RegisterRequest = {
      handle: value.handle.trim(),
      email: value.email.trim(),
      ...(value.password ? { password: value.password } : {}),
      ...(value.team.trim() ? { team: value.team.trim() } : {}),
    };

    this.api.register(registration).subscribe({
      next: () => {
        this.registered.set(true);
        this.error.set(null);
        this.form.reset();
      },
      error: (error: unknown) => {
        this.error.set(
          error instanceof Error ? error.message : 'The registration could not be sent.',
        );
      },
    });
  }
}
