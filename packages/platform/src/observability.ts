import { Counter, Histogram, Registry } from '@prometheus-io/client';

export interface TraceSpan {
  setAttribute(name: string, value: string | number | boolean): void;
  recordException(error: unknown): void;
  end(): void;
}

export interface Tracer {
  startSpan(name: string): TraceSpan;
}

const noOpSpan: TraceSpan = {
  setAttribute: () => undefined,
  recordException: () => undefined,
  end: () => undefined,
};

export const noOpTracer: Tracer = {
  startSpan: () => noOpSpan,
};

export function createMetricsRegistry(serviceName: string): {
  registry: Registry;
  httpRequests: Counter<'method' | 'route' | 'status_code'>;
  httpDuration: Histogram<'method' | 'route' | 'status_code'>;
} {
  const registry = new Registry();
  registry.setDefaultLabels({ service: serviceName });

  const httpRequests = new Counter({
    name: 'atlas_http_requests_total',
    help: 'Completed HTTP requests',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [registry],
  });
  const httpDuration = new Histogram({
    name: 'atlas_http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [registry],
  });

  return { registry, httpRequests, httpDuration };
}
