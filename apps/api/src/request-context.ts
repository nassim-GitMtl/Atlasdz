import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  readonly correlationId: string;
  readonly requestId: string;
}

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function withRequestContext<T>(context: RequestContext, operation: () => T): T {
  return requestContextStorage.run(context, operation);
}

export function currentRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}
