import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  AuthenticatePrincipal,
  PrincipalResolver,
  type AccessCredentialVerifierPort,
  type CredentialVerificationResult,
} from '../src/index.js';
import {
  FixedClock,
  InMemoryAuthorizationRepository,
  makeClaims,
  makeSnapshot,
} from './support.js';

class InMemoryCredentialVerifier implements AccessCredentialVerifierPort {
  public readonly calls: string[] = [];

  public constructor(public result: CredentialVerificationResult) {}

  public async verify(rawCredential: string): Promise<CredentialVerificationResult> {
    this.calls.push(rawCredential);
    return this.result;
  }
}

describe('AuthenticatePrincipal', () => {
  it('passes verified claims into live principal resolution', async () => {
    const verifier = new InMemoryCredentialVerifier({ ok: true, claims: makeClaims() });
    const repository = new InMemoryAuthorizationRepository(makeSnapshot());
    const authenticate = new AuthenticatePrincipal(
      verifier,
      new PrincipalResolver(repository, new FixedClock()),
    );

    const result = await authenticate.execute('Bearer signed-credential');

    assert.equal(result.ok, true);
    assert.deepEqual(verifier.calls, ['Bearer signed-credential']);
    assert.equal(repository.calls.length, 1);
  });

  it('returns credential rejection without querying identity state', async () => {
    const verifier = new InMemoryCredentialVerifier({
      ok: false,
      code: 'CREDENTIAL_REJECTED',
    });
    const repository = new InMemoryAuthorizationRepository(makeSnapshot());
    const authenticate = new AuthenticatePrincipal(
      verifier,
      new PrincipalResolver(repository, new FixedClock()),
    );

    const result = await authenticate.execute('untrusted-input');

    assert.deepEqual(result, { ok: false, code: 'CREDENTIAL_REJECTED' });
    assert.equal(repository.calls.length, 0);
  });
});
