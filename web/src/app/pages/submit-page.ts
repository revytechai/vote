import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  FormArray,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { distinctUntilChanged, map } from 'rxjs';

import { VoteApi } from '../api/vote-api';
import { Submission } from '../api/models';

/** One row of the dynamic artifact (link) list. */
type ArtifactForm = FormGroup<{
  label: FormControl<string>;
  url: FormControl<string>;
}>;

const URL_PATTERN = /^https?:\/\/\S+$/i;

/** Submission form: the project itself plus any number of links. */
@Component({
  selector: 'app-submit-page',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <section class="page" data-testid="submit-page">
      <header class="page-head">
        <p class="eyebrow">Submit</p>
        <h1 data-testid="submit-title-heading">Put your hack on the ballot</h1>
        <p class="tagline">Tell the judges what you built, and link them to it.</p>
      </header>

      @if (created(); as submission) {
        <p class="alert alert-success" role="status" data-testid="submit-success">
          “{{ submission.title }}” is submitted.
        </p>
        <div class="form-actions">
          <a class="button button-primary" [routerLink]="['/s', submission.id]" data-testid="submit-view-link">
            View the submission
          </a>
          <a class="button button-secondary" [routerLink]="['/e', slug(), 'submissions']" data-testid="submit-list-link">
            See all submissions
          </a>
        </div>
      } @else {
        <form class="card stack" [formGroup]="form" (ngSubmit)="submit()" novalidate data-testid="submit-form">
          <div class="form-grid">
            <div class="field" [class.invalid]="invalid('title')">
              <label for="project-title">Project title</label>
              <input
                id="project-title"
                type="text"
                formControlName="title"
                data-testid="submit-title"
              />
              @if (invalid('title')) {
                <p class="field-error" data-testid="submit-title-error">
                  Give the project a title of at least three characters.
                </p>
              }
            </div>

            <div class="field" [class.invalid]="invalid('team')">
              <label for="project-team">Team</label>
              <input
                id="project-team"
                type="text"
                formControlName="team"
                autocomplete="organization"
                data-testid="submit-team"
              />
              @if (invalid('team')) {
                <p class="field-error" data-testid="submit-team-error">Tell us which team built it.</p>
              }
            </div>

            <div class="field field-wide" [class.invalid]="invalid('summary')">
              <label for="project-summary">One-line summary</label>
              <input
                id="project-summary"
                type="text"
                formControlName="summary"
                maxlength="180"
                data-testid="submit-summary"
              />
              @if (invalid('summary')) {
                <p class="field-error" data-testid="submit-summary-error">
                  Write one line that fits on a slide.
                </p>
              }
            </div>

            <div class="field field-wide" [class.invalid]="invalid('description')">
              <label for="project-description">Description</label>
              <textarea
                id="project-description"
                formControlName="description"
                rows="6"
                data-testid="submit-description"
              ></textarea>
              @if (invalid('description')) {
                <p class="field-error" data-testid="submit-description-error">
                  Tell the judges how it works, in at least twenty characters.
                </p>
              }
            </div>
          </div>

          <h2>Links</h2>
          <p class="hint">
            Add a demo, a repository or a write-up. Every link opens in a new tab for the judges.
          </p>

          <div class="stack-sm" formArrayName="artifacts" data-testid="artifact-rows">
            @for (group of artifacts.controls; track group; let i = $index) {
              <div class="artifact-row" [formGroupName]="i" data-testid="artifact-row">
                <div class="field">
                  <label [for]="'artifact-label-' + i">Label</label>
                  <input
                    type="text"
                    [id]="'artifact-label-' + i"
                    formControlName="label"
                    [attr.data-testid]="'artifact-label-' + i"
                  />
                </div>
                <div class="field" [class.invalid]="artifactUrlInvalid(i)">
                  <label [for]="'artifact-url-' + i">URL</label>
                  <input
                    type="url"
                    [id]="'artifact-url-' + i"
                    formControlName="url"
                    placeholder="https://"
                    [attr.data-testid]="'artifact-url-' + i"
                  />
                  @if (artifactUrlInvalid(i)) {
                    <p class="field-error" [attr.data-testid]="'artifact-url-error-' + i">
                      Use a full URL starting with http:// or https://
                    </p>
                  }
                </div>
                <button
                  type="button"
                  class="button button-danger"
                  (click)="removeArtifact(i)"
                  [attr.data-testid]="'remove-artifact-' + i"
                >
                  Remove
                </button>
              </div>
            }
          </div>

          @if (error(); as message) {
            <p class="alert alert-error" role="alert" data-testid="submit-error">{{ message }}</p>
          }

          <div class="form-actions">
            <button type="button" class="button button-secondary" (click)="addArtifact()" data-testid="add-artifact">
              Add a link
            </button>
            <button type="submit" class="button button-primary" data-testid="submit-submit">
              Submit the project
            </button>
          </div>
        </form>
      }
    </section>
  `,
})
export class SubmitPage {
  private readonly api = inject(VoteApi);
  private readonly route = inject(ActivatedRoute);

  private readonly slug$ = this.route.paramMap.pipe(
    map((params) => params.get('slug') ?? 'hackathon-2026'),
    distinctUntilChanged(),
  );

  readonly slug = toSignal(this.slug$, { initialValue: 'hackathon-2026' });
  readonly created = signal<Submission | null>(null);
  readonly error = signal<string | null>(null);

  readonly form = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(3)],
    }),
    team: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    summary: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(180)],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(20)],
    }),
    artifacts: new FormArray<ArtifactForm>([]),
  });

  constructor() {
    this.addArtifact();
  }

  /** The dynamic list of artifact rows. */
  protected get artifacts(): FormArray<ArtifactForm> {
    return this.form.controls.artifacts;
  }

  protected addArtifact(): void {
    this.artifacts.push(
      new FormGroup({
        label: new FormControl('', { nonNullable: true }),
        url: new FormControl('', {
          nonNullable: true,
          validators: [Validators.pattern(URL_PATTERN)],
        }),
      }),
    );
  }

  protected removeArtifact(index: number): void {
    this.artifacts.removeAt(index);
  }

  protected invalid(controlName: 'title' | 'team' | 'summary' | 'description'): boolean {
    const control = this.form.controls[controlName];
    return control.touched && control.invalid;
  }

  protected artifactUrlInvalid(index: number): boolean {
    const control = this.artifacts.at(index).controls.url;
    return control.touched && control.invalid;
  }

  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }

    const value = this.form.getRawValue();
    const artifacts = value.artifacts
      .filter((artifact) => artifact.url.trim().length > 0)
      .map((artifact) => ({
        label: artifact.label.trim() || artifact.url.trim(),
        url: artifact.url.trim(),
      }));

    this.api
      .submit(this.slug(), {
        title: value.title.trim(),
        team: value.team.trim(),
        summary: value.summary.trim(),
        description: value.description.trim(),
        artifacts,
      })
      .subscribe({
        next: (submission) => {
          this.created.set(submission);
          this.error.set(null);
          this.form.reset();
          this.addArtifact();
        },
        error: (error: unknown) => {
          this.error.set(
            error instanceof Error ? error.message : 'The submission could not be sent.',
          );
        },
      });
  }
}
