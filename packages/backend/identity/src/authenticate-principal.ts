import type { AuthenticatePrincipalResult } from './domain.js';
import type { AccessCredentialVerifierPort } from './ports.js';
import type { PrincipalResolver } from './principal-resolver.js';

export class AuthenticatePrincipal {
  public constructor(
    private readonly credentialVerifier: AccessCredentialVerifierPort,
    private readonly principalResolver: PrincipalResolver,
  ) {}

  public async execute(rawCredential: string): Promise<AuthenticatePrincipalResult> {
    const verification = await this.credentialVerifier.verify(rawCredential);
    if (!verification.ok) {
      return verification;
    }

    return this.principalResolver.resolve(verification.claims);
  }
}
