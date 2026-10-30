import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, catchError, map, of, switchMap, tap, throwError } from 'rxjs';

import { API_BASE } from '../api/config';
import { LoginRequest, User } from '../api/models';

/**
 * Session auth per openapi.yaml /auth/*. The server sets the httpOnly
 * `rv_session` cookie; JS never reads it. Swap implementations in app.config.ts.
 */
export abstract class AuthService {
  /** POST /auth/login (204 sets the session cookie), then GET /auth/me. */
  abstract login(identifier: string, password: string): Observable<User>;
  /** POST /auth/logout */
  abstract logout(): Observable<void>;
  /** GET /auth/me; `null` on 401. */
  abstract me(): Observable<User | null>;
  /** GET /auth/csrf. CONTRACT GAP: response body is undocumented; the token also arrives as the rv_csrf cookie. */
  abstract csrf(): Observable<void>;
  /** Cached current user for the UI. */
  abstract currentUser(): Observable<User | null>;
}

@Injectable()
export class HttpAuthService extends AuthService {
  private readonly http = inject(HttpClient);
  private readonly user = new BehaviorSubject<User | null>(null);

  login(identifier: string, password: string): Observable<User> {
    const body: LoginRequest = { identifier, password };
    return this.http.post<void>(`${API_BASE}/auth/login`, body).pipe(
      // 204 sets the session cookie; then ask who we are.
      switchMap(() => this.me()),
      switchMap((user) => (user ? of(user) : throwError(() => new Error('Signed in, but /auth/me returned nobody.')))),
    );
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${API_BASE}/auth/logout`, {}).pipe(tap(() => this.user.next(null)));
  }

  me(): Observable<User | null> {
    return this.http.get<User>(`${API_BASE}/auth/me`).pipe(
      tap((user) => this.user.next(user)),
      catchError((error) => {
        if (error?.status === 401) {
          this.user.next(null);
          return of(null);
        }
        return throwError(() => error);
      }),
    );
  }

  csrf(): Observable<void> {
    return this.http.get<unknown>(`${API_BASE}/auth/csrf`).pipe(map(() => undefined));
  }

  currentUser(): Observable<User | null> {
    return this.user.asObservable();
  }
}

/** Password accepted by {@link MockAuthService} for any identifier. */
export const MOCK_PASSWORD = 'REVY-2026';

/** In-memory auth used by the demo build and unit tests. Mirrors the contract's status codes. */
@Injectable()
export class MockAuthService extends AuthService {
  private readonly user = new BehaviorSubject<User | null>(null);
  private nextUserId = 1;
  private failures = 0;

  login(identifier: string, password: string): Observable<User> {
    const id = (identifier ?? '').trim();
    if (this.failures >= 5) {
      return throwError(() => ({ status: 429, message: 'Too many failed sign-ins. Try again in 15 minutes.' }));
    }
    if (!id || (password ?? '').trim() !== MOCK_PASSWORD) {
      this.failures++;
      return throwError(() => ({ status: 401, message: 'That sign-in was not accepted.' }));
    }
    this.failures = 0;
    const signedIn: User = { id: this.nextUserId++, name: id, role: 'participant' };
    this.user.next(signedIn);
    return of(signedIn);
  }

  logout(): Observable<void> {
    this.user.next(null);
    return of(undefined);
  }

  me(): Observable<User | null> {
    return of(this.user.value);
  }

  csrf(): Observable<void> {
    return of(undefined);
  }

  currentUser(): Observable<User | null> {
    return this.user.asObservable();
  }
}
