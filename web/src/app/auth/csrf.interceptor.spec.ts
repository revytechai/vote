import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER,
  CSRF_TOKEN_PROVIDER,
  CookieCsrfTokenProvider,
  csrfInterceptor,
  isApiRequest,
} from './csrf.interceptor';

describe('csrfInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([csrfInterceptor])),
        provideHttpClientTesting(),
        { provide: CSRF_TOKEN_PROVIDER, useValue: { getToken: () => 'token-123' } },
      ],
    });

    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  it('copies the token into the header on a POST', () => {
    http.post('/api/v1/events/hackathon-2026/join', { inviteCode: 'REVY-2026' }).subscribe();

    const request = controller.expectOne('/api/v1/events/hackathon-2026/join');
    expect(request.request.headers.get(CSRF_HEADER)).toBe('token-123');
    request.flush({});
  });

  it('sends the request with credentials', () => {
    http.put('/api/v1/rounds/1/ballot', { roundId: 1, scores: {} }).subscribe();

    const request = controller.expectOne('/api/v1/rounds/1/ballot');
    expect(request.request.withCredentials).toBeTrue();
    request.flush({});
  });

  it('does not add the header to a GET', () => {
    http.get('/api/v1/events/hackathon-2026').subscribe();

    const request = controller.expectOne('/api/v1/events/hackathon-2026');
    expect(request.request.headers.get(CSRF_HEADER)).toBeNull();
    request.flush({});
  });

  it('does not add the header to a HEAD request', () => {
    http.head('/api/v1/events/hackathon-2026').subscribe();

    const request = controller.expectOne('/api/v1/events/hackathon-2026');
    expect(request.request.headers.get(CSRF_HEADER)).toBeNull();
    request.flush({});
  });

  it('leaves requests outside the API alone', () => {
    http.post('/somewhere-else', {}).subscribe();

    const request = controller.expectOne('/somewhere-else');
    expect(request.request.headers.get(CSRF_HEADER)).toBeNull();
    expect(request.request.withCredentials).toBeFalse();
    request.flush({});
  });
});

describe('csrfInterceptor without a token', () => {
  let http: HttpClient;
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([csrfInterceptor])),
        provideHttpClientTesting(),
        { provide: CSRF_TOKEN_PROVIDER, useValue: { getToken: () => null } },
      ],
    });

    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  it('still sends the request with credentials', () => {
    http.post('/api/v1/events/hackathon-2026/join', {}).subscribe();

    const request = controller.expectOne('/api/v1/events/hackathon-2026/join');
    expect(request.request.headers.get(CSRF_HEADER)).toBeNull();
    expect(request.request.withCredentials).toBeTrue();
    request.flush({});
  });
});

describe('CookieCsrfTokenProvider', () => {
  it('reads the token from the cookie', () => {
    document.cookie = `${CSRF_COOKIE_NAME}=cookie-value; path=/`;

    const provider = new CookieCsrfTokenProvider();

    expect(provider.getToken()).toBe('cookie-value');

    document.cookie = `${CSRF_COOKIE_NAME}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  });

  it('returns null when the cookie is missing', () => {
    const provider = new CookieCsrfTokenProvider();

    expect(provider.getToken()).toBeNull();
  });
});

describe('isApiRequest', () => {
  it('recognises API URLs', () => {
    expect(isApiRequest('/api/v1')).toBeTrue();
    expect(isApiRequest('/api/v1/events')).toBeTrue();
    expect(isApiRequest('/api/v1/events?slug=1')).toBeTrue();
  });

  it('rejects everything else', () => {
    expect(isApiRequest('/api/v1docs')).toBeFalse();
    expect(isApiRequest('/other')).toBeFalse();
  });
});
