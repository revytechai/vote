/**
 * Domain model for the public hackathon voting frontend.
 *
 * Every shape here mirrors one REST resource under `/api`. Ids are numeric and
 * start at 1; `0` is used as the "no winner" sentinel on {@link Results}.
 */

/** Lifecycle of a hackathon event. */
export type EventStatus = 'registration' | 'live' | 'voting' | 'closed';

/** A hackathon event. */
export interface Event {
  /** URL-safe identifier, e.g. `hackathon-2026`. */
  slug: string;
  name: string;
  tagline: string;
  description: string;
  /** ISO-8601 timestamp. */
  startsAt: string;
  /** ISO-8601 timestamp. */
  endsAt: string;
  location: string;
  status: EventStatus;
}

/** A seed idea teams can pick up. */
export interface Idea {
  id: number;
  title: string;
  summary: string;
}

/** A judging round. Only the STAR method is implemented. */
export interface Round {
  id: number;
  eventSlug: string;
  name: string;
  method: 'STAR';
  status: 'open' | 'closed';
  /** Submissions that take part in this round. */
  submissionIds: number[];
}

/** An external link attached to a submission (demo, repo, write-up...). */
export interface Artifact {
  label: string;
  /** Absolute URL. */
  url: string;
}

/** A team submission. */
export interface Submission {
  id: number;
  eventSlug: string;
  title: string;
  team: string;
  summary: string;
  description: string;
  artifacts: Artifact[];
}

/** An award. `winnerSubmissionId` is absent until the prize is awarded. */
export interface Prize {
  id: number;
  name: string;
  description: string;
  winnerSubmissionId?: number;
}

/** Ballot per openapi.yaml `Ballot`: submission id -> score (0..max_score). */
export interface Ballot {
  scores: Record<number, number>;
}

/** One row of a round result (openapi.yaml `Result.rows`). */
export interface ResultRow {
  submission_id: number;
  title: string;
  total: number;
  mean: number;
  rank: number;
}

/** STAR runoff block (openapi.yaml `Result.runoff`). */
export interface ResultRunoff {
  a?: number;
  b?: number;
  prefer_a?: number;
  prefer_b?: number;
  equal?: number;
  winner?: number;
  tiebreak?: string;
}

/** Round result, computed by the API only (openapi.yaml `Result`). */
export interface Result {
  round: number;
  method: 'star' | 'score' | 'approval';
  ballots: number;
  rows: ResultRow[];
  runoff?: ResultRunoff | null;
  final: boolean;
}

/** Team (openapi.yaml `Team`). */
export interface Team {
  id: number;
  name: string;
  members: string[];
}

/** Body for POST /events/{slug}/ideas (openapi.yaml `Idea`; id/vote_points/pres_no are server-set). */
export interface NewIdea {
  title: string;
  proposer?: string;
  description?: string;
  link?: string;
}

/** Roles per openapi.yaml `Role`. */
export type Role = 'superuser' | 'manager' | 'sponsor' | 'viewer' | 'participant';

/**
 * Body for POST /auth/register. The contract gives no schema, only the summary
 * "handle, email, optional password and team"; these four fields are exactly that.
 */
export interface RegisterRequest {
  handle: string;
  email: string;
  password?: string;
  team?: string;
}

/**
 * Body for POST /auth/login. CONTRACT GAP: openapi.yaml defines no request body.
 * `identifier` + `password` is a placeholder until the contract names them.
 */
export interface LoginRequest {
  identifier: string;
  password: string;
}

/** A signed-in account. */
/** CONTRACT GAP: /auth/me has no response schema; placeholder shape (email never exposed). */
export interface User {
  id: number;
  name: string;
  role: Role;
}

/** Payload for submitting a project. */
export interface NewSubmission {
  title: string;
  team: string;
  summary: string;
  description: string;
  artifacts: Artifact[];
}
