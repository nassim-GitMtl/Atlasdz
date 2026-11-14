import { randomUUID } from 'node:crypto';

import { CorrelationIdSchema } from '@atlas/contracts';
import type { NextFunction, Request, Response } from 'express';

import type { CorrelatedRequest } from '../http-types.js';
import { withRequestContext } from '../request-context.js';

function acceptedCorrelationId(request: Request): string | undefined {
  const candidate = request.headers['x-correlation-id'];
  if (typeof candidate !== 'string') {
    return undefined;
  }

  const parsed = CorrelationIdSchema.safeParse(candidate);
  return parsed.success ? parsed.data : undefined;
}

export function correlationMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const correlationId = acceptedCorrelationId(request) ?? randomUUID();
  const requestId = randomUUID();
  const correlatedRequest = request as CorrelatedRequest;
  correlatedRequest.correlationId = correlationId;
  correlatedRequest.requestId = requestId;
  response.setHeader('X-Correlation-Id', correlationId);

  withRequestContext({ correlationId, requestId }, next);
}
