import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

import {
  CorrelationIdSchema,
  ErrorEnvelopeSchema,
  HealthResponseSchema,
} from '../../packages/contracts/dist/index.js';

const LOOPBACK_HOST = '127.0.0.1';
const SMOKE_SERVICE_NAME = 'atlas-api-smoke';
const ALLOWED_ORIGIN = 'http://127.0.0.1:4173';
const STARTUP_TIMEOUT_MS = 30_000;
const REQUEST_TIMEOUT_MS = 2_000;
const RETRY_INTERVAL_MS = 250;
const SHUTDOWN_TIMEOUT_MS = 10_000;
const FORCE_KILL_TIMEOUT_MS = 5_000;
const MAX_CAPTURED_OUTPUT_BYTES = 32 * 1024;

const smokeDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(smokeDirectory, '../..');
const apiEntryPoint = resolve(repositoryRoot, 'apps/api/dist/main.js');

type ChildOutcome =
  | { readonly kind: 'exit'; readonly code: number | null; readonly signal: NodeJS.Signals | null }
  | { readonly kind: 'spawn_error'; readonly error: Error };

interface CapturedChild {
  readonly process: ChildProcessWithoutNullStreams;
  readonly outcome: Promise<ChildOutcome>;
  readonly environment: NodeJS.ProcessEnv;
  spawnError: Error | undefined;
  stdout: string;
  stderr: string;
}

interface StopResult {
  readonly outcome: ChildOutcome;
  readonly forced: boolean;
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, durationMs));
}

function loadFileEnvironment(): NodeJS.ProcessEnv {
  for (const filename of ['.env.local', '.env.example']) {
    const path = resolve(repositoryRoot, filename);
    if (existsSync(path)) {
      return parseEnv(readFileSync(path, 'utf8'));
    }
  }

  return {};
}

async function findAvailableLoopbackPort(): Promise<number> {
  const server = createServer();
  server.unref();

  return new Promise((resolvePort, rejectPort) => {
    server.once('error', rejectPort);
    server.listen(0, LOOPBACK_HOST, () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        rejectPort(new Error('Could not allocate a loopback port for the API smoke test.'));
        return;
      }

      server.close((error) => {
        if (error !== undefined) {
          rejectPort(error);
          return;
        }
        resolvePort(address.port);
      });
    });
  });
}

function appendCapturedOutput(current: string, chunk: string | Buffer): string {
  const next = current + chunk.toString();
  return next.length <= MAX_CAPTURED_OUTPUT_BYTES
    ? next
    : next.slice(next.length - MAX_CAPTURED_OUTPUT_BYTES);
}

function startApi(environment: NodeJS.ProcessEnv): CapturedChild {
  const child = spawn(process.execPath, [apiEntryPoint], {
    cwd: repositoryRoot,
    env: environment,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stdin.end();
  const captured: CapturedChild = {
    process: child,
    environment,
    spawnError: undefined,
    stdout: '',
    stderr: '',
    outcome: new Promise<ChildOutcome>((resolveOutcome) => {
      child.once('error', (error) => {
        captured.spawnError = error;
        resolveOutcome({ kind: 'spawn_error', error });
      });
      child.once('exit', (code, signal) => {
        resolveOutcome({ kind: 'exit', code, signal });
      });
    }),
  };

  child.stdout.on('data', (chunk: string | Buffer) => {
    captured.stdout = appendCapturedOutput(captured.stdout, chunk);
  });
  child.stderr.on('data', (chunk: string | Buffer) => {
    captured.stderr = appendCapturedOutput(captured.stderr, chunk);
  });

  return captured;
}

function childExitSummary(child: CapturedChild): string | undefined {
  if (child.spawnError !== undefined) {
    return `spawn failed (${child.spawnError.name})`;
  }
  if (child.process.exitCode !== null) {
    return `exited with code ${child.process.exitCode}`;
  }
  if (child.process.signalCode !== null) {
    return `exited from signal ${child.process.signalCode}`;
  }
  return undefined;
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(url, {
    ...init,
    redirect: 'error',
    signal: AbortSignal.timeout(Math.max(1, timeoutMs)),
  });
}

async function waitForStatus(
  child: CapturedChild,
  url: string,
  expectedStatus: number,
  description: string,
): Promise<Response> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  let lastObservation = 'no response';

  while (Date.now() < deadline) {
    const exitSummary = childExitSummary(child);
    if (exitSummary !== undefined) {
      throw new Error(`API ${exitSummary} before ${description} became available.`);
    }

    const remainingMs = deadline - Date.now();
    try {
      const response = await fetchWithTimeout(url, Math.min(REQUEST_TIMEOUT_MS, remainingMs));
      if (response.status === expectedStatus) {
        return response;
      }
      lastObservation = `HTTP ${response.status}`;
      await response.body?.cancel();
    } catch (error) {
      lastObservation = error instanceof Error ? error.name : 'request failed';
    }

    const delayMs = Math.min(RETRY_INTERVAL_MS, Math.max(0, deadline - Date.now()));
    if (delayMs > 0) {
      await delay(delayMs);
    }
  }

  throw new Error(
    `${description} did not return HTTP ${expectedStatus} within ${STARTUP_TIMEOUT_MS}ms (${lastObservation}).`,
  );
}

async function responseJson(response: Response, description: string): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error(`${description} did not return a JSON response.`);
  }
}

async function assertLiveContract(baseUrl: string, child: CapturedChild): Promise<void> {
  const response = await waitForStatus(child, `${baseUrl}/health/live`, 200, 'liveness endpoint');
  const health = HealthResponseSchema.parse(await responseJson(response, 'Liveness endpoint'));

  assert.equal(health.status, 'ok');
  assert.equal(health.service, SMOKE_SERVICE_NAME);
  assert.equal(response.headers.get('x-correlation-id'), health.correlationId);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('strict-transport-security'), null);

  const contentSecurityPolicy = response.headers.get('content-security-policy');
  assert.notEqual(contentSecurityPolicy, null);
  if (contentSecurityPolicy === null) {
    throw new Error('Liveness endpoint did not return a Content-Security-Policy header.');
  }
  assert.ok(contentSecurityPolicy.includes("default-src 'none'"));
  assert.ok(contentSecurityPolicy.includes("frame-ancestors 'none'"));
}

async function assertReadyContract(baseUrl: string, child: CapturedChild): Promise<void> {
  const response = await waitForStatus(child, `${baseUrl}/health/ready`, 200, 'readiness endpoint');
  const health = HealthResponseSchema.parse(await responseJson(response, 'Readiness endpoint'));

  assert.equal(health.status, 'ok');
  assert.equal(health.service, SMOKE_SERVICE_NAME);
  assert.equal(health.dependencies?.['postgres'], 'up');
  assert.equal(response.headers.get('x-correlation-id'), health.correlationId);
}

async function assertCorrelationContract(baseUrl: string): Promise<void> {
  const suppliedCorrelationId = '3e4666bf-d5e5-4aa7-b8ce-cefe41c7568a';
  const accepted = await fetchWithTimeout(`${baseUrl}/health/live`, REQUEST_TIMEOUT_MS, {
    headers: { 'X-Correlation-Id': suppliedCorrelationId },
  });
  assert.equal(accepted.status, 200);
  const acceptedHealth = HealthResponseSchema.parse(
    await responseJson(accepted, 'Correlation check'),
  );
  assert.equal(accepted.headers.get('x-correlation-id'), suppliedCorrelationId);
  assert.equal(acceptedHealth.correlationId, suppliedCorrelationId);

  const rejected = await fetchWithTimeout(`${baseUrl}/health/live`, REQUEST_TIMEOUT_MS, {
    headers: { 'X-Correlation-Id': 'unsafe-correlation-value' },
  });
  assert.equal(rejected.status, 200);
  const rejectedHealth = HealthResponseSchema.parse(
    await responseJson(rejected, 'Unsafe correlation check'),
  );
  assert.notEqual(rejectedHealth.correlationId, 'unsafe-correlation-value');
  CorrelationIdSchema.parse(rejectedHealth.correlationId);
  assert.equal(rejected.headers.get('x-correlation-id'), rejectedHealth.correlationId);
}

async function assertErrorContract(baseUrl: string): Promise<void> {
  const correlationId = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
  const response = await fetchWithTimeout(`${baseUrl}/__smoke_missing__`, REQUEST_TIMEOUT_MS, {
    headers: { 'X-Correlation-Id': correlationId },
  });
  assert.equal(response.status, 404);

  const body = await responseJson(response, 'Missing-route check');
  const envelope = ErrorEnvelopeSchema.parse(body);
  assert.equal(envelope.code, 'RESOURCE_NOT_FOUND');
  assert.equal(envelope.message, 'The resource was not found.');
  assert.equal(envelope.correlationId, correlationId);
  assert.equal(response.headers.get('x-correlation-id'), correlationId);
  assert.equal(JSON.stringify(body).includes('NotFoundException'), false);
}

async function assertIdentityFailClosedContract(baseUrl: string): Promise<void> {
  const correlationId = '5cf4672d-fb8a-4fb2-88fc-fbf2575073ee';
  const credential = 'synthetic-provider-token';
  const response = await fetchWithTimeout(`${baseUrl}/api/v1/auth/sessions`, REQUEST_TIMEOUT_MS, {
    headers: {
      Authorization: `Bearer ${credential}`,
      'X-Correlation-Id': correlationId,
    },
  });
  assert.equal(response.status, 401);

  const body = await responseJson(response, 'Fail-closed identity check');
  const envelope = ErrorEnvelopeSchema.parse(body);
  assert.equal(envelope.code, 'AUTHENTICATION_REQUIRED');
  assert.equal(envelope.message, 'Authentication is required.');
  assert.equal(envelope.correlationId, correlationId);
  assert.equal(response.headers.get('x-correlation-id'), correlationId);
  assert.equal(JSON.stringify(body).includes(credential), false);
}

async function assertCorsContract(baseUrl: string): Promise<void> {
  const allowed = await fetchWithTimeout(`${baseUrl}/health/live`, REQUEST_TIMEOUT_MS, {
    headers: { Origin: ALLOWED_ORIGIN },
  });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('access-control-allow-origin'), ALLOWED_ORIGIN);
  assert.equal(allowed.headers.get('access-control-allow-credentials'), 'true');
  await allowed.arrayBuffer();

  const denied = await fetchWithTimeout(`${baseUrl}/health/live`, REQUEST_TIMEOUT_MS, {
    headers: { Origin: `${ALLOWED_ORIGIN}.attacker.example` },
  });
  assert.equal(denied.status, 200);
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
  await denied.arrayBuffer();
}

async function waitForOutcome(
  outcome: Promise<ChildOutcome>,
  timeoutMs: number,
): Promise<ChildOutcome | undefined> {
  return Promise.race([outcome, delay(timeoutMs).then(() => undefined)]);
}

async function stopApi(child: CapturedChild): Promise<StopResult> {
  const alreadyStopped = childExitSummary(child) !== undefined;
  if (!alreadyStopped) {
    child.process.kill('SIGTERM');
  }

  const gracefulOutcome = await waitForOutcome(child.outcome, SHUTDOWN_TIMEOUT_MS);
  if (gracefulOutcome !== undefined) {
    return { outcome: gracefulOutcome, forced: false };
  }

  child.process.kill('SIGKILL');
  const forcedOutcome = await waitForOutcome(child.outcome, FORCE_KILL_TIMEOUT_MS);
  if (forcedOutcome === undefined) {
    throw new Error('API process did not exit after SIGKILL.');
  }

  return { outcome: forcedOutcome, forced: true };
}

function sensitiveValues(environment: NodeJS.ProcessEnv): readonly string[] {
  const sensitiveKey =
    /(?:authorization|cookie|password|passcode|token|secret|api.?key|database_url)/i;
  return Object.entries(environment)
    .filter(([key, value]) => sensitiveKey.test(key) && value !== undefined && value.length >= 4)
    .map(([, value]) => value as string)
    .sort((left, right) => right.length - left.length);
}

function redactDiagnostics(value: string, environment: NodeJS.ProcessEnv): string {
  let redacted = value.replace(
    /\b(postgres(?:ql)?):\/\/[^\s/@]+(?::[^\s/@]*)?@/giu,
    '$1://[REDACTED]@',
  );
  for (const sensitiveValue of sensitiveValues(environment)) {
    redacted = redacted.split(sensitiveValue).join('[REDACTED]');
  }
  return redacted.trim();
}

function childDiagnostics(child: CapturedChild): string {
  const stdout = redactDiagnostics(child.stdout, child.environment);
  const stderr = redactDiagnostics(child.stderr, child.environment);
  const sections = [
    stdout.length > 0 ? `stdout:\n${stdout}` : undefined,
    stderr.length > 0 ? `stderr:\n${stderr}` : undefined,
  ].filter((section): section is string => section !== undefined);

  return sections.length === 0 ? '' : `\nRedacted API diagnostics:\n${sections.join('\n')}`;
}

async function main(): Promise<void> {
  if (!existsSync(apiEntryPoint)) {
    throw new Error('Built API entrypoint is missing. Run `pnpm build` before `pnpm smoke`.');
  }

  const port = await findAvailableLoopbackPort();
  const environment: NodeJS.ProcessEnv = {
    ...loadFileEnvironment(),
    ...process.env,
    NODE_ENV: 'test',
    SERVICE_NAME: SMOKE_SERVICE_NAME,
    HOST: LOOPBACK_HOST,
    PORT: String(port),
    LOG_LEVEL: 'info',
    CORS_ALLOWED_ORIGINS: ALLOWED_ORIGIN,
    REQUEST_BODY_LIMIT_BYTES: '1048576',
    ENABLE_ELECTRONIC_PAYMENTS: 'false',
    ENABLE_REAL_PAYOUTS: 'false',
  };
  if (environment['DATABASE_URL'] === undefined || environment['DATABASE_URL'].length === 0) {
    throw new Error('DATABASE_URL is required through the environment or .env.local.');
  }

  const child = startApi(environment);
  const baseUrl = `http://${LOOPBACK_HOST}:${port}`;
  let stopped = false;

  try {
    await assertLiveContract(baseUrl, child);
    await assertReadyContract(baseUrl, child);
    await assertCorrelationContract(baseUrl);
    await assertErrorContract(baseUrl);
    await assertIdentityFailClosedContract(baseUrl);
    await assertCorsContract(baseUrl);

    const stopResult = await stopApi(child);
    stopped = true;
    assert.equal(stopResult.forced, false, 'API required SIGKILL during shutdown.');
    if (stopResult.outcome.kind === 'spawn_error') {
      throw new Error(`API process could not start (${stopResult.outcome.error.name}).`);
    }
    assert.equal(
      stopResult.outcome.signal,
      null,
      'API exited from a signal after handling SIGTERM.',
    );
    assert.equal(stopResult.outcome.code, 0, 'API did not exit cleanly after SIGTERM.');

    process.stdout.write(
      'API smoke passed: live, ready, security headers, correlation, errors, fail-closed identity, CORS, and graceful shutdown.\n',
    );
  } catch (error) {
    if (!stopped) {
      await stopApi(child).catch(() => undefined);
    }
    const message = error instanceof Error ? error.message : 'Unknown smoke-test failure.';
    throw new Error(`${message}${childDiagnostics(child)}`, { cause: error });
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown smoke-test failure.';
  process.stderr.write(`API smoke failed: ${message}\n`);
  process.exitCode = 1;
});
