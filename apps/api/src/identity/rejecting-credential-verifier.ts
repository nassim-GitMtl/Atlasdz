import type { AccessCredentialVerifierPort, CredentialVerificationResult } from '@atlas/identity';

/**
 * The production composition root remains closed until an approved credential
 * provider and signing-key custody implementation are supplied.
 */
export class RejectingCredentialVerifier implements AccessCredentialVerifierPort {
  public async verify(_rawCredential: string): Promise<CredentialVerificationResult> {
    return Object.freeze({ ok: false, code: 'CREDENTIAL_REJECTED' as const });
  }
}
