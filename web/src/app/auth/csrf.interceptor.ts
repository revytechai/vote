import { HttpInterceptorFn } from '@angular/common/http';
import { InjectionToken, inject } from '@angular/core';

import { API_BASE } from '../api/config';

/** Header the API expects the CSRF token in. */
export const CSRF_HEADER = 'X-CSRF-Token';

/** Name of the cookie the default provider reads the token from. */
export const CSRF_COOKIE_NAME = 'rv_csrf';

/**
 * Pluggable source of the CSRF token.
 *
 * Implement this to move the token somewhere else (a meta tag, an in-memory
 * value, a test double) without touching the interceptor.
 */
export interface CsrfTokenProvider {
  /** The token to send, or `null` when there is none. */
  getToken(): string | null;
}

/** Reads a cookie value, or `null` when the cookie is absent. */
export function readCookie(name: string): string | null {
  if (typeof document === 'undefined' || typeof document.cookie !== 'string') {
    return null;
  }
  for (const part of document.cookie.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) {
      continue;
    }
    if (part.slice(0, separator).trim() !== name) {
      continue;
    }
    const value = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

/** Default provider: the token lives in the `rv_csrf` cookie. */
export class CookieCsrfTokenProvider implements CsrfTokenProvider {
  getToken(): string | null {
    return readCookie(CSRF_COOKIE_NAME);
  }
}

/**
 * Injection token holding the token source. Override it to plug in a
 * different provider.
 */
export const CSRF_TOKEN_PROVIDER = new InjectionToken<CsrfTokenProvider>('CSRF_TOKEN_PROVIDER', {
  providedIn: 'root',
  factory: () => new CookieCsrfTokenProvider(),
});

const SAFE_METHODS = new Set(['GET', 'HEAD']);

/** True when the request targets the voting API. */
export function isApiRequest(url: string): boolean {
  return url === API_BASE || url.startsWith(`${API_BASE}/`) || url.startsWith(`${API_BASE}?`);
}

/**
 * Adds the CSRF token to every state-changing API call.
 *
 * Safe methods (`GET`, `HEAD`) are left untouched. Everything else that goes
 * to `/api` carries the token in the `X-CSRF-Token` header and is sent with
 * credentials so the session cookie travels with it.
 */
export const csrfInterceptor: HttpInterceptorFn = (req, next) => {
  if (SAFE_METHODS.has(req.method.toUpperCase()) || !isApiRequest(req.url)) {
    return next(req);
  }

  const provider = inject(CSRF_TOKEN_PROVIDER);
  const token = provider.getToken();

  return next(
    req.clone({
      setHeaders: token ? { [CSRF_HEADER]: token } : {},
      withCredentials: true,
    }),
  );
};
