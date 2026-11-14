import type { LoggerService } from '@nestjs/common';
import type { Logger } from 'pino';

export class NestLogger implements LoggerService {
  public constructor(private readonly logger: Logger) {}

  public log(message: unknown, context?: string): void {
    this.logger.info({ context }, this.toMessage(message));
  }

  public error(message: unknown, trace?: string, context?: string): void {
    this.logger.error({ context, trace }, this.toMessage(message));
  }

  public warn(message: unknown, context?: string): void {
    this.logger.warn({ context }, this.toMessage(message));
  }

  public debug(message: unknown, context?: string): void {
    this.logger.debug({ context }, this.toMessage(message));
  }

  public verbose(message: unknown, context?: string): void {
    this.logger.trace({ context }, this.toMessage(message));
  }

  private toMessage(message: unknown): string {
    return typeof message === 'string' ? message : 'Nest application event';
  }
}
