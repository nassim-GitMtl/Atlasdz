import assert from 'node:assert/strict';
import test from 'node:test';
import { revokeSellerSession, SellerApiError } from './api.ts';

const currentId = '90000000-0000-4000-8000-000000000001';
const otherId = '90000000-0000-4000-8000-000000000002';
const session = (id = currentId, current = true) => ({
  id,
  current,
  deviceLabel: 'Synthetic unit test',
  assuranceLevel: 'MFA',
  issuedAt: '2026-10-21T10:00:00.000Z',
  lastSeenAt: null,
  expiresAt: '2026-10-21T10:30:00.000Z',
});
const failure = (code: string) => (error: unknown) =>
  error instanceof SellerApiError && error.code === code;

test('logout revokes only the authoritative current session family with uncached bounded requests', async (t) => {
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: URL, init: RequestInit) => {
    const target = new URL(url);
    calls.push(`${init.method} ${target.pathname}`);
    assert.equal(init.cache, 'no-store');
    assert.equal(init.redirect, 'error');
    assert.ok(init.signal instanceof AbortSignal);
    assert.equal(new Headers(init.headers).get('authorization'), 'Bearer synthetic-unit-only');
    assert.equal(init.body, undefined);
    assert.equal(target.search, '');
    return init.method === 'GET'
      ? Response.json({ sessions: [session(otherId, false), session()] })
      : new Response(null, { status: 204 });
  });
  await revokeSellerSession('synthetic-unit-only');
  assert.deepEqual(calls, [
    'GET /api/v1/auth/sessions',
    `DELETE /api/v1/auth/sessions/${currentId}`,
  ]);
});

test('logout refuses missing, ambiguous or malformed current-family responses without deleting anything', async (t) => {
  for (const body of [
    { sessions: [] },
    { sessions: [session(otherId, false)] },
    { sessions: [session(), session(otherId)] },
    { sessions: [session('../other')] },
    { sessions: [session()], unexpected: true },
    { sessions: [{ id: currentId, current: true }] },
  ]) {
    let calls = 0;
    const mock = t.mock.method(globalThis, 'fetch', async (_url: URL, init: RequestInit) => {
      calls++;
      assert.equal(init.method, 'GET');
      return Response.json(body);
    });
    await assert.rejects(revokeSellerSession('synthetic-unit-only'), failure('unavailable'));
    assert.equal(calls, 1);
    mock.mock.restore();
  }
});

test('only a 401 is an unusable credential; forbidden, limiter and service failures remain retryable', async (t) => {
  for (const stage of ['list', 'revoke']) {
    for (const [status, code] of [
      [401, 'unauthorized'],
      [403, 'forbidden'],
      [404, 'unavailable'],
      [429, 'unavailable'],
      [503, 'unavailable'],
    ] as const) {
      const mock = t.mock.method(globalThis, 'fetch', async (_url: URL, init: RequestInit) =>
        stage === 'revoke' && init.method === 'GET'
          ? Response.json({ sessions: [session()] })
          : new Response(null, { status }),
      );
      await assert.rejects(revokeSellerSession('synthetic-unit-only'), failure(code));
      mock.mock.restore();
    }
  }
});

test('logout does not accept malformed success, redirects or an unconfirmed network response', async (t) => {
  for (const result of [
    () => Response.json({ ok: true }),
    () => new Response(null, { status: 302 }),
    () => {
      throw new Error('Synthetic network failure');
    },
  ]) {
    const mock = t.mock.method(globalThis, 'fetch', async (_url: URL, init: RequestInit) =>
      init.method === 'GET' ? Response.json({ sessions: [session()] }) : result(),
    );
    await assert.rejects(revokeSellerSession('synthetic-unit-only'), failure('unavailable'));
    mock.mock.restore();
  }
});

test('a lost revocation response can be retried and the resulting 401 identifies an already closed session', async (t) => {
  let revoked = false;
  let deletes = 0;
  t.mock.method(globalThis, 'fetch', async (_url: URL, init: RequestInit) => {
    if (revoked) return new Response(null, { status: 401 });
    if (init.method === 'GET') return Response.json({ sessions: [session()] });
    revoked = true;
    deletes++;
    throw new Error('Synthetic response lost after commit');
  });
  await assert.rejects(revokeSellerSession('synthetic-unit-only'), failure('unavailable'));
  await assert.rejects(revokeSellerSession('synthetic-unit-only'), failure('unauthorized'));
  assert.equal(deletes, 1);
});
