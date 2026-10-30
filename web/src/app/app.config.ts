import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { MockVoteApi, VoteApi } from './api/vote-api';
import { AuthService, MockAuthService } from './auth/auth.service';
import { csrfInterceptor } from './auth/csrf.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([csrfInterceptor])),

    // ------------------------------------------------------------------
    // This is the single place where the backend is chosen.
    // Swap `MockVoteApi` for `HttpVoteApi` and `MockAuthService` for a real
    // session service to run against the live API.
    // ------------------------------------------------------------------
    { provide: VoteApi, useClass: MockVoteApi },
    { provide: AuthService, useClass: MockAuthService },
  ],
};
