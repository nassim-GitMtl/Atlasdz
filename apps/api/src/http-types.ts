import type { Request } from 'express';

export type CorrelatedRequest = Request & {
  correlationId: string;
  requestId: string;
};
