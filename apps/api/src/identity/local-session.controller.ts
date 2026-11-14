import { SafeApplicationError } from '@atlas/contracts';
import { Body, Controller, Inject, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/index.js';

export const LOCAL_SESSION_ISSUER = Symbol('atlas.local-session-issuer');
export interface LocalSessionIssuer {
  createSession(
    account: 'seller' | 'admin' | 'customer',
  ): Promise<{ accessToken: string; expiresAt: string }>;
}

/** Only mounted by the explicit loopback LOCAL/TEST composition root. */
@Controller('api/v1/local')
@Public()
export class LocalSessionController {
  private attempts = 0;
  private windowStart = Date.now();

  public constructor(@Inject(LOCAL_SESSION_ISSUER) private readonly issuer: LocalSessionIssuer) {}

  @Post('session')
  public async create(@Req() request: Request, @Body() input: unknown) {
    const address = request.socket.remoteAddress;
    const origin = request.headers.origin;
    if (
      !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address ?? '') ||
      (origin !== undefined &&
        ![
          'http://127.0.0.1:3002',
          'http://localhost:3002',
          'http://127.0.0.1:3001',
          'http://localhost:3001',
        ].includes(origin))
    ) {
      throw new SafeApplicationError('FORBIDDEN');
    }
    const now = Date.now();
    if (now - this.windowStart >= 60_000) {
      this.windowStart = now;
      this.attempts = 0;
    }
    if (++this.attempts > 10)
      throw new SafeApplicationError('RATE_LIMITED', { retryAfterSeconds: 60 });
    if (
      typeof input !== 'object' ||
      input === null ||
      Array.isArray(input) ||
      Object.keys(input).length !== 1 ||
      !('account' in input) ||
      (input.account !== 'seller' && input.account !== 'admin' && input.account !== 'customer')
    ) {
      throw new SafeApplicationError('VALIDATION_FAILED');
    }
    return this.issuer.createSession(input.account);
  }
}
