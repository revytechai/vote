import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';

import { AuthService } from './auth/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ReactiveFormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** True while the mobile navigation panel is expanded. */
  protected readonly menuOpen = signal(false);
  protected readonly signInError = signal<string | null>(null);
  protected readonly user = toSignal(this.auth.currentUser(), { initialValue: null });

  protected readonly signInForm = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    }),
    code: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  constructor() {
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => this.menuOpen.set(false));
  }

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  protected signIn(): void {
    if (this.signInForm.invalid) {
      this.signInForm.markAllAsTouched();
      return;
    }
    const { name, code } = this.signInForm.getRawValue();
    this.auth.login(name, code).subscribe({
      next: () => {
        this.signInForm.reset();
        this.signInError.set(null);
      },
      error: (error: unknown) => {
        const message = (error as { message?: unknown } | null)?.message;
        this.signInError.set(typeof message === 'string' ? message : 'Sign-in failed.');
      },
    });
  }

  protected signOut(): void {
    this.auth.logout().subscribe();
    this.signInError.set(null);
  }
}
