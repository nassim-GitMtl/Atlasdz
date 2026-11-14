import type { Counter, Histogram } from '@prometheus-io/client';
import type { Logger } from 'pino';
import type { NextFunction, Request, Response } from 'express';

import type { CorrelatedRequest } from '../http-types.js';

export interface HttpMetrics {
  readonly httpRequests: Counter<'method' | 'route' | 'status_code'>;
  readonly httpDuration: Histogram<'method' | 'route' | 'status_code'>;
}

export function requestObservabilityMiddleware(logger: Logger, metrics: HttpMetrics) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const startedAt = process.hrtime.bigint();
    const correlatedRequest = request as CorrelatedRequest;

    response.once('finish', () => {
      const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
      const route = request.route === undefined ? 'unmatched' : String(request.route.path);
      const statusCode = String(response.statusCode);
      const labels = { method: request.method, route, status_code: statusCode };
      metrics.httpRequests.inc(labels);
      metrics.httpDuration.observe(labels, durationSeconds);

      if (!request.path.startsWith('/health/')) {
        logger.info(
          {
            correlationId: correlatedRequest.correlationId,
            requestId: correlatedRequest.requestId,
            http: {
              method: request.method,
              route,
              statusCode: response.statusCode,
              durationMs: Math.round(durationSeconds * 1000),
            },
          },
          'request completed',
        );
      }
    });

    next();
  };
}
