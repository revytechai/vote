import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

import { HttpAuthService, MOCK_PASSWORD, MockAuthService } from './auth.service';

describe('HttpAuthService (/api/v1/auth/*)', () => {
  let auth: HttpAuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [HttpAuthService, provideHttpClient(), provideHttpClientTesting()],
    });
    auth = TestBed.inject(HttpAuthService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('login POSTs /auth/login then GETs /auth/me', () => {
    let name = '';
    auth.login('ada', 'pw').subscribe((u) => (name = u.name));
    const login = http.expectOne('/api/v1/auth/login');
    expect(login.request.method).toBe('POST');
    login.flush(null, { status: 204, statusText: 'No Content' });
    http.expectOne('/api/v1/auth/me').flush({ id: 1, name: 'ada', role: 'participant' });
    expect(name).toBe('ada');
  });

  it('me returns null on 401', () => {
    let result: unknown = 'unset';
    auth.me().subscribe((u) => (result = u));
    http.expectOne('/api/v1/auth/me').flush({ error: 'unauthenticated' }, { status: 401, statusText: 'Unauthorized' });
    expect(result).toBeNull();
  });

  it('logout POSTs /auth/logout', () => {
    auth.logout().subscribe();
    const req = http.expectOne('/api/v1/auth/logout');
    expect(req.request.method).toBe('POST');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('csrf GETs /auth/csrf', () => {
    auth.csrf().subscribe();
    const req = http.expectOne('/api/v1/auth/csrf');
    expect(req.request.method).toBe('GET');
    req.flush({});
  });
});

describe('MockAuthService', () => {
  let auth: MockAuthService;
  beforeEach(() => (auth = new MockAuthService()));

  it('signs in with the demo password and reports me', async () => {
    await firstValueFrom(auth.login('ada', MOCK_PASSWORD));
    expect((await firstValueFrom(auth.me()))?.name).toBe('ada');
  });

  it('rejects a wrong password with 401', async () => {
    let error: any;
    try {
      await firstValueFrom(auth.login('ada', 'nope'));
    } catch (err) {
      error = err;
    }
    expect(error?.status).toBe(401);
    await expectAsync(firstValueFrom(auth.login('ada', 'nope'))).toBeRejectedWith(jasmine.objectContaining({ status: 401 }));
  });

  it('locks out after 5 failures with 429', async () => {
    for (let i = 0; i < 5; i++) {
      await firstValueFrom(auth.login('ada', 'nope')).catch(() => undefined);
    }
    let error: any;
    try {
      await firstValueFrom(auth.login('ada', MOCK_PASSWORD));
    } catch (err) {
      error = err;
    }
    expect(error?.status).toBe(429);
    await expectAsync(firstValueFrom(auth.login('ada', MOCK_PASSWORD))).toBeRejectedWith(jasmine.objectContaining({ status: 429 }));
  });

  it('logout clears me', async () => {
    await firstValueFrom(auth.login('ada', MOCK_PASSWORD));
    await firstValueFrom(auth.logout());
    expect(await firstValueFrom(auth.me())).toBeNull();
  });

  it('csrf completes', async () => {
    const result = await firstValueFrom(auth.csrf(), { defaultValue: undefined });
    expect(result).toBeUndefined();
    await expectAsync(firstValueFrom(auth.csrf(), { defaultValue: undefined })).toBeResolved();
  });
});
