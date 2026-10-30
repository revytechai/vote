import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

import { HttpVoteApi, MockVoteApi } from './vote-api';

describe('HttpVoteApi (contract paths under /api/v1)', () => {
  let api: HttpVoteApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [HttpVoteApi, provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(HttpVoteApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('GET /submissions/{id}', () => {
    api.getSubmission(7).subscribe();
    expect(http.expectOne('/api/v1/submissions/7').request.method).toBe('GET');
  });

  it('GET /rounds/{id}/ballot', () => {
    api.getBallot(3).subscribe();
    expect(http.expectOne('/api/v1/rounds/3/ballot').request.method).toBe('GET');
  });

  it('PUT /rounds/{id}/ballot sends only { scores }', () => {
    api.castBallot(3, { scores: { 1: 5 } }).subscribe();
    const req = http.expectOne('/api/v1/rounds/3/ballot');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ scores: { 1: 5 } });
  });

  it('GET /rounds/{id}/results', () => {
    api.getResults(3).subscribe();
    expect(http.expectOne('/api/v1/rounds/3/results').request.method).toBe('GET');
  });

  it('POST /auth/register with handle, email, password, team only', () => {
    api.register({ handle: 'ada', email: 'ada@example.com', password: 'x', team: 'T' }).subscribe();
    const req = http.expectOne('/api/v1/auth/register');
    expect(req.request.method).toBe('POST');
    expect(Object.keys(req.request.body).sort()).toEqual(['email', 'handle', 'password', 'team']);
  });

  it('POST /events/{slug}/ideas', () => {
    api.proposeIdea('hackathon-2026', { title: 'Idea' }).subscribe();
    const req = http.expectOne('/api/v1/events/hackathon-2026/ideas');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ title: 'Idea' });
  });

  it('POST /teams', () => {
    api.createTeam('Rebels').subscribe();
    const req = http.expectOne('/api/v1/teams');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: 'Rebels' });
  });
});

describe('MockVoteApi', () => {
  let api: MockVoteApi;
  beforeEach(() => (api = new MockVoteApi()));

  it('returns one submission by id', async () => {
    const submission = await firstValueFrom(api.getSubmission(1));
    expect(submission.title).toBe('Fleet Pulse');
  });

  it('errors on an unknown submission', async () => {
    let error: any;
    try {
      await firstValueFrom(api.getSubmission(999));
    } catch (err) {
      error = err;
    }
    expect(error).toBeDefined();
    await expectAsync(firstValueFrom(api.getSubmission(999))).toBeRejected();
  });

  it('returns an empty ballot before voting and the saved one after', async () => {
    expect((await firstValueFrom(api.getBallot(1))).scores).toEqual({});
    await firstValueFrom(api.castBallot(1, { scores: { 1: 5, 2: 3 } }));
    expect((await firstValueFrom(api.getBallot(1))).scores).toEqual({ 1: 5, 2: 3 });
  });

  it('serves results from canned API data and counts a new ballot once', async () => {
    const before = await firstValueFrom(api.getResults(1));
    expect(before.method).toBe('star');
    expect(before.rows).toHaveSize(4);
    await firstValueFrom(api.castBallot(1, { scores: { 1: 5 } }));
    await firstValueFrom(api.castBallot(1, { scores: { 1: 4 } }));
    const after = await firstValueFrom(api.getResults(1));
    expect(after.ballots).toBe(before.ballots + 1);
    expect(after.rows).toEqual(before.rows);
  });

  it('pushes results to a live stream after a ballot', async () => {
    const seen: number[] = [];
    const sub = api.streamResults(1).subscribe((r) => seen.push(r.ballots));
    await firstValueFrom(api.castBallot(1, { scores: { 1: 5 } }));
    sub.unsubscribe();
    expect(seen).toHaveSize(2);
    expect(seen[1]).toBe(seen[0] + 1);
  });

  it('registers once and rejects a duplicate handle', async () => {
    await firstValueFrom(api.register({ handle: 'ada', email: 'ada@example.com' }));
    expect(api.registrations).toHaveSize(1);
    let error: any;
    try {
      await firstValueFrom(api.register({ handle: 'ada', email: 'b@example.com' }));
    } catch (err) {
      error = err;
    }
    expect(error).toBeDefined();
    await expectAsync(firstValueFrom(api.register({ handle: 'ada', email: 'b@example.com' }))).toBeRejected();
  });

  it('rejects a registration without a handle', async () => {
    let error: any;
    try {
      await firstValueFrom(api.register({ handle: ' ', email: 'a@example.com' }));
    } catch (err) {
      error = err;
    }
    expect(error).toBeDefined();
    await expectAsync(firstValueFrom(api.register({ handle: ' ', email: 'a@example.com' }))).toBeRejected();
  });

  it('accepts an idea with a title and rejects one without', async () => {
    await firstValueFrom(api.proposeIdea('hackathon-2026', { title: 'Cool' }));
    expect(api.proposedIdeas).toHaveSize(1);
    await expectAsync(firstValueFrom(api.proposeIdea('hackathon-2026', { title: '' }))).toBeRejected();
  });

  it('creates teams with increasing ids', async () => {
    const a = await firstValueFrom(api.createTeam('A'));
    const b = await firstValueFrom(api.createTeam('B'));
    expect(b.id).toBe(a.id + 1);
    expect(a.members).toEqual([]);
  });
});
