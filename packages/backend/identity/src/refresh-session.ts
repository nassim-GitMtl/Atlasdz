import type { RefreshSessionRotationCommand, RefreshSessionRotationResult } from './domain.js';
import type { RefreshSessionRepositoryPort } from './ports.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const TOKEN_DIGEST_LENGTH = 32;

const equalBytes = (left: Uint8Array, right: Uint8Array): boolean => {
  if (left.byteLength !== right.byteLength) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
};

const validatedCommand = (
  command: RefreshSessionRotationCommand,
): RefreshSessionRotationCommand => {
  if (
    !UUID_PATTERN.test(command.successorSessionId) ||
    (!UUID_PATTERN.test(command.correlationId) && !ULID_PATTERN.test(command.correlationId)) ||
    !(command.presentedTokenDigest instanceof Uint8Array) ||
    command.presentedTokenDigest.byteLength !== TOKEN_DIGEST_LENGTH ||
    !(command.successorTokenDigest instanceof Uint8Array) ||
    command.successorTokenDigest.byteLength !== TOKEN_DIGEST_LENGTH ||
    equalBytes(command.presentedTokenDigest, command.successorTokenDigest)
  ) {
    throw new TypeError('Invalid refresh session command');
  }

  return Object.freeze({
    presentedTokenDigest: new Uint8Array(command.presentedTokenDigest),
    successorSessionId: command.successorSessionId,
    successorTokenDigest: new Uint8Array(command.successorTokenDigest),
    correlationId: command.correlationId,
  });
};

/**
 * Raw-token-free application command. Credential parsing/digest derivation and
 * successor bearer generation occur in a future provider adapter before this
 * boundary; this command owns only authoritative rotation/replay persistence.
 */
export class RefreshSession {
  public constructor(private readonly sessions: RefreshSessionRepositoryPort) {}

  public async execute(
    command: RefreshSessionRotationCommand,
  ): Promise<RefreshSessionRotationResult> {
    return this.sessions.rotateOrRecordReplayAtomically(validatedCommand(command));
  }
}
