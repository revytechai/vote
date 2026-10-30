import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface BallotSessionData {
  sessionId: string;
  codeHash: string;
  eventId: number | null;
}

export const BallotSession = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): BallotSessionData | null => {
    const request = ctx.switchToHttp().getRequest();
    return request.ballotSession || null;
  },
);
