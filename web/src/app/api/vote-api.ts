import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, of, throwError } from 'rxjs';

import { API_BASE } from './config';
import {
  Ballot,
  Event as VoteEvent,
  Idea,
  NewIdea,
  NewSubmission,
  Prize,
  RegisterRequest,
  Result,
  Round,
  Submission,
  Team,
} from './models';

/**
 * Everything the public frontend can ask the backend for.
 *
 * The class is abstract so the whole application can be pointed at a different
 * implementation (a real HTTP API, an in-memory fake) from a single provider
 * registration in `app.config.ts`.
 */
export abstract class VoteApi {
  /** GET /events/{slug} */
  abstract getEvent(slug: string): Observable<VoteEvent>;
  /** GET /events/{slug}/ideas */
  abstract listIdeas(slug: string): Observable<Idea[]>;
  /** GET /events/{slug}/rounds */
  abstract listRounds(slug: string): Observable<Round[]>;
  /** GET /events/{slug}/submissions (approved submissions only) */
  abstract listSubmissions(slug: string): Observable<Submission[]>;
  /** GET /submissions/{id} */
  abstract getSubmission(id: number): Observable<Submission>;
  /** GET /events/{slug}/prizes */
  abstract listPrizes(slug: string): Observable<Prize[]>;
  /** POST /events/{slug}/join */
  abstract join(slug: string, inviteCode: string): Observable<void>;
  /** GET /rounds/{id}/ballot (my current ballot, used to prefill the vote page) */
  abstract getBallot(roundId: number): Observable<Ballot>;
  /** PUT /rounds/{id}/ballot */
  abstract castBallot(roundId: number, ballot: Ballot): Observable<void>;
  /** GET /rounds/{id}/results (computed by the API; the frontend never tallies) */
  abstract getResults(roundId: number): Observable<Result>;
  /** SSE /rounds/{id}/results/stream */
  abstract streamResults(roundId: number): Observable<Result>;
  /** POST /auth/register */
  abstract register(registration: RegisterRequest): Observable<void>;
  /** POST /events/{slug}/ideas */
  abstract proposeIdea(slug: string, idea: NewIdea): Observable<void>;
  /** POST /teams. CONTRACT GAP: no request body schema; `{ name }` is a placeholder. */
  abstract createTeam(name: string): Observable<Team>;
  /** POST /events/{slug}/submissions */
  abstract submit(slug: string, submission: NewSubmission): Observable<Submission>;
}

/**
 * The real client: REST over `HttpClient` plus a server-sent-events stream for
 * live results.
 */
@Injectable()
export class HttpVoteApi extends VoteApi {
  private readonly http = inject(HttpClient);

  getEvent(slug: string): Observable<VoteEvent> {
    return this.http.get<VoteEvent>(`${API_BASE}/events/${slug}`);
  }

  listIdeas(slug: string): Observable<Idea[]> {
    return this.http.get<Idea[]>(`${API_BASE}/events/${slug}/ideas`);
  }

  listRounds(slug: string): Observable<Round[]> {
    return this.http.get<Round[]>(`${API_BASE}/events/${slug}/rounds`);
  }

  listSubmissions(slug: string): Observable<Submission[]> {
    return this.http.get<Submission[]>(`${API_BASE}/events/${slug}/submissions`);
  }

  getSubmission(id: number): Observable<Submission> {
    return this.http.get<Submission>(`${API_BASE}/submissions/${id}`);
  }

  listPrizes(slug: string): Observable<Prize[]> {
    return this.http.get<Prize[]>(`${API_BASE}/events/${slug}/prizes`);
  }

  join(slug: string, inviteCode: string): Observable<void> {
    return this.http.post<void>(`${API_BASE}/events/${slug}/join`, { inviteCode });
  }

  getBallot(roundId: number): Observable<Ballot> {
    return this.http.get<Ballot>(`${API_BASE}/rounds/${roundId}/ballot`);
  }

  castBallot(roundId: number, ballot: Ballot): Observable<void> {
    return this.http.put<void>(`${API_BASE}/rounds/${roundId}/ballot`, { scores: ballot.scores });
  }

  getResults(roundId: number): Observable<Result> {
    return this.http.get<Result>(`${API_BASE}/rounds/${roundId}/results`);
  }

  streamResults(roundId: number): Observable<Result> {
    return new Observable<Result>((subscriber) => {
      if (typeof EventSource === 'undefined') {
        subscriber.error(new Error('Server-sent events are not supported here.'));
        return;
      }

      const source = new EventSource(`${API_BASE}/rounds/${roundId}/results/stream`, {
        withCredentials: true,
      });

      source.onmessage = (message: MessageEvent<string>) => {
        try {
          subscriber.next(JSON.parse(message.data) as Result);
        } catch (error) {
          subscriber.error(error);
        }
      };
      source.onerror = (error: Event) => subscriber.error(error);

      return () => source.close();
    });
  }

  register(registration: RegisterRequest): Observable<void> {
    return this.http.post<void>(`${API_BASE}/auth/register`, registration);
  }

  proposeIdea(slug: string, idea: NewIdea): Observable<void> {
    return this.http.post<void>(`${API_BASE}/events/${slug}/ideas`, idea);
  }

  createTeam(name: string): Observable<Team> {
    return this.http.post<Team>(`${API_BASE}/teams`, { name });
  }

  submit(slug: string, submission: NewSubmission): Observable<Submission> {
    return this.http.post<Submission>(`${API_BASE}/events/${slug}/submissions`, submission);
  }
}

/** Invite code accepted by the in-memory API for the seeded event. */
export const MOCK_INVITE_CODE = 'REVY-2026';

interface MockSubmissionRecord {
  submission: Submission;
  /** Only approved submissions are visible in the public list. */
  approved: boolean;
}

/**
 * In-memory implementation used by the demo build and by the unit tests.
 *
 * It keeps the seeded event, four approved submissions, one open STAR round,
 * three prizes and a handful of ballots so the results page has something real
 * to show. Casting a ballot pushes the new tally to every live results stream.
 */
@Injectable()
export class MockVoteApi extends VoteApi {
  private readonly event: VoteEvent = {
    slug: 'hackathon-2026',
    name: 'OpenZFS Hackathon',
    tagline: 'Build, break and benchmark OpenZFS — then vote on the best hack.',
    description:
      'Every team ships something real in 36 hours. Judging runs on STAR: judges score every ' +
      'submission from 0 to 5, the two best projects go to a runoff, and the crowd gets to watch ' +
      'the scores land live.',
    startsAt: '2026-03-14T09:00:00.000Z',
    endsAt: '2026-03-16T18:00:00.000Z',
    location: 'Online and in person — hosted by REVYTECH',
    status: 'voting',
  };

  private readonly ideas: Idea[] = [
    { id: 1, title: 'Fleet Pulse', summary: 'A live health board for every machine we run.' },
    { id: 2, title: 'Signal Garden', summary: 'A shared notes garden grown out of the community chat.' },
    { id: 3, title: 'Pantry Pal', summary: 'Turn the team snack inventory into a friendly bot.' },
    { id: 4, title: 'Rollback Radio', summary: 'One keystroke to hear what a rollback just did.' },
  ];

  private readonly records: MockSubmissionRecord[] = [
    {
      approved: true,
      submission: {
        id: 1,
        eventSlug: 'hackathon-2026',
        title: 'Fleet Pulse',
        team: 'Team Observability',
        summary: 'One screen that says whether the fleet is healthy.',
        description:
          'Fleet Pulse collects the health of every machine we run and renders it as a single board. ' +
          'It pages the on-call engineer with the one thing that actually broke, instead of the forty ' +
          'things that merely moved.',
        artifacts: [
          { label: 'Live demo', url: 'https://demo.revytechinc.ai/fleet-pulse' },
          { label: 'Source code', url: 'https://github.com/revytechinc/fleet-pulse' },
          { label: 'Write-up', url: 'https://revytechinc.ai/blog/fleet-pulse' },
        ],
      },
    },
    {
      approved: true,
      submission: {
        id: 2,
        eventSlug: 'hackathon-2026',
        title: 'Signal Garden',
        team: 'Greenhouse',
        summary: 'A notes garden that grows out of the community chat.',
        description:
          'Signal Garden pulls the good parts out of a noisy chat and plants them as notes. Every ' +
          'answer is a seedling, every repeat question is proof that something is missing.',
        artifacts: [
          { label: 'Live demo', url: 'https://demo.revytechinc.ai/signal-garden' },
          { label: 'Source code', url: 'https://github.com/revytechinc/signal-garden' },
        ],
      },
    },
    {
      approved: true,
      submission: {
        id: 3,
        eventSlug: 'hackathon-2026',
        title: 'Pantry Pal',
        team: 'Snack Attack',
        summary: 'The snack cupboard, with an opinion.',
        description:
          'Pantry Pal knows what is left in the cupboard, what the team likes, and when the coffee ' +
          'is about to run out. It is silly, it works, and it made three people laugh during the demo.',
        artifacts: [
          { label: 'Live demo', url: 'https://demo.revytechinc.ai/pantry-pal' },
          { label: 'Source code', url: 'https://github.com/revytechinc/pantry-pal' },
        ],
      },
    },
    {
      approved: true,
      submission: {
        id: 4,
        eventSlug: 'hackathon-2026',
        title: 'Rollback Radio',
        team: 'Rebel Reverts',
        summary: 'Press one key and hear what a rollback just did.',
        description:
          'Rollback Radio narrates deployments and rollbacks out loud. It reads the diff, explains ' +
          'the risk, and confirms what actually changed once the release finishes.',
        artifacts: [
          { label: 'Live demo', url: 'https://demo.revytechinc.ai/rollback-radio' },
          { label: 'Write-up', url: 'https://revytechinc.ai/blog/rollback-radio' },
        ],
      },
    },
    {
      // Not approved yet: hidden from the public submission list.
      approved: false,
      submission: {
        id: 5,
        eventSlug: 'hackathon-2026',
        title: 'Drift Detector',
        team: 'Night Shift',
        summary: 'Notices when the running system stops matching the code.',
        description: 'Draft entry, still being reviewed by the organizers.',
        artifacts: [],
      },
    },
  ];

  private readonly rounds: Round[] = [
    {
      id: 1,
      eventSlug: 'hackathon-2026',
      name: 'Final judging — STAR',
      method: 'STAR',
      status: 'open',
      submissionIds: [1, 2, 3, 4],
    },
  ];

  private readonly prizes: Prize[] = [
    {
      id: 1,
      name: 'Grand Prize — Best Overall Hack',
      description: 'The project the judges would still want to run on Monday morning.',
      winnerSubmissionId: 1,
    },
    {
      id: 2,
      name: 'Best Developer Experience',
      description: 'For the project that other teams would most like to copy.',
    },
    {
      id: 3,
      name: 'Most Delightful Demo',
      description: 'Awarded to the team that made the room smile during the demo.',
    },
  ];

  /**
   * Canned API results. The mock never tallies: results come from the server,
   * so the mock only replays a fixed `Result` and bumps its ballot count.
   */
  private readonly results = new Map<number, Result>([
    [
      1,
      {
        round: 1,
        method: 'star',
        ballots: 5,
        rows: [
          { submission_id: 2, title: 'Signal Garden', total: 20, mean: 4, rank: 1 },
          { submission_id: 1, title: 'Fleet Pulse', total: 19, mean: 3.8, rank: 2 },
          { submission_id: 3, title: 'Pantry Pal', total: 15, mean: 3, rank: 3 },
          { submission_id: 4, title: 'Rollback Radio', total: 12, mean: 2.4, rank: 4 },
        ],
        runoff: { a: 2, b: 1, prefer_a: 2, prefer_b: 3, equal: 0, winner: 1, tiebreak: '' },
        final: false,
      },
    ],
  ]);

  /** The visitor's own ballot per round (GET /rounds/{id}/ballot). */
  private readonly myBallots = new Map<number, Ballot>();
  private readonly teams: Team[] = [];
  private nextTeamId = 1;
  readonly proposedIdeas: NewIdea[] = [];
  readonly registrations: RegisterRequest[] = [];

  private readonly joinedEvents = new Set<string>();
  private readonly resultStreams = new Map<number, Subject<Result>>();
  private nextSubmissionId = 6;

  getEvent(slug: string): Observable<VoteEvent> {
    if (slug !== this.event.slug) {
      return throwError(() => new Error(`Unknown event "${slug}".`));
    }
    return of(this.event);
  }

  listIdeas(slug: string): Observable<Idea[]> {
    return of([...this.ideas]);
  }

  listRounds(slug: string): Observable<Round[]> {
    return of(this.rounds.filter((round) => round.eventSlug === slug).map((round) => ({ ...round })));
  }

  listSubmissions(slug: string): Observable<Submission[]> {
    return of(
      this.records
        .filter((record) => record.approved && record.submission.eventSlug === slug)
        .map((record) => ({ ...record.submission, artifacts: [...record.submission.artifacts] })),
    );
  }

  getSubmission(id: number): Observable<Submission> {
    const record = this.records.find((candidate) => candidate.submission.id === id);
    if (!record) {
      return throwError(() => new Error(`Submission ${id} was not found.`));
    }
    return of({ ...record.submission, artifacts: [...record.submission.artifacts] });
  }

  listPrizes(slug: string): Observable<Prize[]> {
    return of(this.prizes.map((prize) => ({ ...prize })));
  }

  join(slug: string, inviteCode: string): Observable<void> {
    if (slug !== this.event.slug) {
      return throwError(() => new Error(`Unknown event "${slug}".`));
    }
    if (inviteCode.trim().toUpperCase() !== MOCK_INVITE_CODE) {
      return throwError(() => new Error('That invite code was not accepted.'));
    }
    this.joinedEvents.add(slug);
    return of(undefined);
  }

  getBallot(roundId: number): Observable<Ballot> {
    const ballot = this.myBallots.get(roundId);
    return of({ scores: { ...ballot?.scores } });
  }

  castBallot(roundId: number, ballot: Ballot): Observable<void> {
    const round = this.rounds.find((candidate) => candidate.id === roundId);
    if (!round) {
      return throwError(() => new Error(`Round ${roundId} was not found.`));
    }
    if (round.status !== 'open') {
      return throwError(() => new Error('This round is closed.'));
    }
    const isNew = !this.myBallots.has(roundId);
    this.myBallots.set(roundId, { scores: { ...ballot.scores } });
    const current = this.results.get(roundId);
    if (current && isNew) {
      this.results.set(roundId, { ...current, ballots: current.ballots + 1 });
    }
    this.pushResults(roundId);
    return of(undefined);
  }

  getResults(roundId: number): Observable<Result> {
    const result = this.results.get(roundId);
    if (!result) {
      return throwError(() => new Error(`Round ${roundId} was not found.`));
    }
    return of(structuredClone(result));
  }

  streamResults(roundId: number): Observable<Result> {
    return new Observable<Result>((subscriber) => {
      const result = this.results.get(roundId);
      if (!result) {
        subscriber.error(new Error(`Round ${roundId} was not found.`));
        return;
      }

      subscriber.next(structuredClone(result));

      const stream = this.resultStream(roundId);
      const subscription = stream.subscribe((results) => subscriber.next(results));
      return () => subscription.unsubscribe();
    });
  }

  register(registration: RegisterRequest): Observable<void> {
    if (!registration?.handle?.trim()) {
      return throwError(() => new Error('A handle is required.'));
    }
    if (!registration?.email?.includes('@')) {
      return throwError(() => new Error('A valid email address is required.'));
    }
    if (this.registrations.some((r) => r.handle === registration.handle || r.email === registration.email)) {
      return throwError(() => new Error('That handle or email is already registered.'));
    }
    this.registrations.push({ ...registration });
    return of(undefined);
  }

  proposeIdea(slug: string, idea: NewIdea): Observable<void> {
    if (!idea?.title?.trim()) {
      return throwError(() => new Error('An idea needs a title.'));
    }
    this.proposedIdeas.push({ ...idea });
    return of(undefined);
  }

  createTeam(name: string): Observable<Team> {
    if (!name?.trim()) {
      return throwError(() => new Error('A team needs a name.'));
    }
    const team: Team = { id: this.nextTeamId++, name: name.trim(), members: [] };
    this.teams.push(team);
    return of({ ...team, members: [] });
  }

  submit(slug: string, submission: NewSubmission): Observable<Submission> {
    if (!submission?.title?.trim()) {
      return throwError(() => new Error('A submission needs a title.'));
    }
    const created: Submission = {
      id: this.nextSubmissionId++,
      eventSlug: slug,
      title: submission.title.trim(),
      team: submission.team.trim(),
      summary: submission.summary.trim(),
      description: submission.description.trim(),
      artifacts: (submission.artifacts ?? [])
        .filter((artifact) => artifact.url?.trim())
        .map((artifact) => ({ label: artifact.label?.trim() || artifact.url.trim(), url: artifact.url.trim() })),
    };
    this.records.push({ submission: created, approved: true });
    return of({ ...created, artifacts: [...created.artifacts] });
  }

  /** True when the visitor already joined the event with a valid invite code. */
  hasJoined(slug: string): boolean {
    return this.joinedEvents.has(slug);
  }

  private resultStream(roundId: number): Subject<Result> {
    let stream = this.resultStreams.get(roundId);
    if (!stream) {
      stream = new Subject<Result>();
      this.resultStreams.set(roundId, stream);
    }
    return stream;
  }

  private pushResults(roundId: number): void {
    const result = this.results.get(roundId);
    if (result) {
      this.resultStream(roundId).next(structuredClone(result));
    }
  }
}
