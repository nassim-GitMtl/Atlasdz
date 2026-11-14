import assert from 'node:assert/strict';
import test from 'node:test';
import { revokeCustomerSession, CartApiError } from './cart-client.ts';

const currentId = '90000000-0000-4000-8000-000000000001';
const otherId = '90000000-0000-4000-8000-000000000002';
const session = (id = currentId, current = true) => ({
  id,
  current,
  deviceLabel: 'Synthetic unit test',
  assuranceLevel: 'PRIMARY',
  issuedAt: '2026-10-21T10:00:00.000Z',
  lastSeenAt: null,
  expiresAt: '2026-10-21T10:30:00.000Z',
});
const failure = (code: string) => (error: unknown) =>
  error instanceof CartApiError && error.code === code;

test('customer logout revokes exactly its current family without caching or redirecting credentials', async (t) => {
  const paths: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: URL, init: RequestInit) => {
    paths.push(`${init.method} ${url.pathname}`);
    assert.equal(init.cache, 'no-store');
    assert.equal(init.redirect, 'error');
    assert.ok(init.signal instanceof AbortSignal);
    assert.equal(new Headers(init.headers).get('authorization'), 'Bearer synthetic-unit-only');
    assert.equal(init.body, undefined);
    return init.method === 'GET'
      ? Response.json({ sessions: [session(otherId, false), session()] })
      : new Response(null, { status: 204 });
  });
  await revokeCustomerSession('synthetic-unit-only');
  assert.deepEqual(paths, [
    'GET /api/v1/auth/sessions',
    `DELETE /api/v1/auth/sessions/${currentId}`,
  ]);
});

test('customer logout rejects absent, ambiguous and invalid current sessions', async (t) => {
  for (const sessions of [
    [],
    [session(otherId, false)],
    [session(), session(otherId)],
    [session('../bad')],
  ]) {
    const mock = t.mock.method(globalThis, 'fetch', async (_url: URL, init: RequestInit) => {
      assert.equal(init.method, 'GET');
      return Response.json({ sessions });
    });
    await assert.rejects(revokeCustomerSession('synthetic-unit-only'), failure('unavailable'));
    mock.mock.restore();
  }
});

test('customer logout treats only 401 as expired; 403, throttling and service failure cannot discard the session', async (t) => {
  for (const phase of ['list', 'delete']) {
    for (const status of [401, 403, 404, 429, 503]) {
      const mock = t.mock.method(globalThis, 'fetch', async (_url: URL, init: RequestInit) =>
        phase === 'delete' && init.method === 'GET'
          ? Response.json({ sessions: [session()] })
          : Response.json({ code: 'SYNTHETIC_TEST_FAILURE' }, { status }),
      );
      await assert.rejects(
        revokeCustomerSession('synthetic-unit-only'),
        failure(status === 401 ? 'auth' : 'unavailable'),
      );
      mock.mock.restore();
    }
  }
});

test('customer logout retains a retry path when the revocation response is lost after commit', async (t) => {
  let revoked = false;
  t.mock.method(globalThis, 'fetch', async (_url: URL, init: RequestInit) => {
    if (revoked) return new Response(null, { status: 401 });
    if (init.method === 'GET') return Response.json({ sessions: [session()] });
    revoked = true;
    throw new Error('Synthetic response lost after commit');
  });
  await assert.rejects(revokeCustomerSession('synthetic-unit-only'), failure('unavailable'));
  await assert.rejects(revokeCustomerSession('synthetic-unit-only'), failure('auth'));
});
