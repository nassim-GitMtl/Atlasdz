import {
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
  type ArgumentsHost,
  Inject,
} from '@nestjs/common';
import { SafeApplicationError, type ErrorEnvelope } from '@atlas/contracts';
import type { Request, Response } from 'express';
import type { Logger } from 'pino';

import type { CorrelatedRequest } from '../http-types.js';
import { STRUCTURED_LOGGER } from '../tokens.js';

const statusContract: Readonly<Record<number, { code: string; message: string }>> = {
  [HttpStatus.BAD_REQUEST]: { code: 'MALFORMED_REQUEST', message: 'The request is malformed.' },
  [HttpStatus.UNAUTHORIZED]: {
    code: 'AUTHENTICATION_REQUIRED',
    message: 'Authentication is required.',
  },
  [HttpStatus.FORBIDDEN]: { code: 'FORBIDDEN', message: 'The request is not permitted.' },
  [HttpStatus.NOT_FOUND]: { code: 'RESOURCE_NOT_FOUND', message: 'The resource was not found.' },
  [HttpStatus.METHOD_NOT_ALLOWED]: {
    code: 'METHOD_NOT_ALLOWED',
    message: 'The method is not supported.',
  },
  [HttpStatus.PAYLOAD_TOO_LARGE]: {
    code: 'PAYLOAD_TOO_LARGE',
    message: 'The request payload is too large.',
  },
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: {
    code: 'UNSUPPORTED_MEDIA_TYPE',
    message: 'The media type is not supported.',
  },
  [HttpStatus.UNPROCESSABLE_ENTITY]: {
    code: 'VALIDATION_FAILED',
    message: 'The request failed validation.',
  },
  [HttpStatus.TOO_MANY_REQUESTS]: {
    code: 'RATE_LIMITED',
    message: 'Too many requests.',
  },
  [HttpStatus.SERVICE_UNAVAILABLE]: {
    code: 'SERVICE_UNAVAILABLE',
    message: 'The service is temporarily unavailable.',
  },
  [HttpStatus.GATEWAY_TIMEOUT]: {
    code: 'UPSTREAM_TIMEOUT',
    message: 'A required dependency timed out.',
  },
};

@Catch()
export class GlobalErrorFilter implements ExceptionFilter {
  public constructor(@Inject(STRUCTURED_LOGGER) private readonly logger: Logger) {}

  public catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>() as CorrelatedRequest;
    const response = context.getResponse<Response>();
    const typedError = exception instanceof SafeApplicationError ? exception : undefined;
    const status =
      typedError?.status ?? (exception instanceof HttpException ? exception.getStatus() : 500);
    const contract =
      typedError === undefined
        ? (statusContract[status] ?? {
            code: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred.',
          })
        : { code: typedError.code, message: typedError.safeMessage };
    const envelope: ErrorEnvelope = {
      code: contract.code,
      message: contract.message,
      correlationId: request.correlationId,
      ...(typedError?.details === undefined ? {} : { details: typedError.details }),
    };

    if (status >= 500) {
      this.logger.error(
        {
          correlationId: request.correlationId,
          requestId: request.requestId,
          error: exception instanceof Error ? exception : new Error('Unknown thrown value'),
          errorCode: contract.code,
        },
        'request failed',
      );
    }

    response.status(status).json(envelope);
  }
}
