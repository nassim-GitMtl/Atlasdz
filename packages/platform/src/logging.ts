import pino, { type DestinationStream, type Logger, type LoggerOptions } from 'pino';

export const REDACTED_LOG_PATHS = [
  'password',
  '*.password',
  'otp',
  '*.otp',
  'token',
  '*.token',
  'authorization',
  '*.authorization',
  'cookie',
  '*.cookie',
  'set-cookie',
  '*.set-cookie',
  'pan',
  '*.pan',
  'cvv',
  '*.cvv',
  'pin',
  '*.pin',
  'secret',
  '*.secret',
] as const;

const sensitiveKeyPattern =
  /(?:authorization|cookie|password|passcode|otp|mfa|recovery|token|secret|api.?key|signing.?key|pan|cvv|pin|bank|phone|email|address|deliveryContact|recipientName|^city$|^body$|gps|document|signature|evidence)/i;

function redactObject(value: unknown, visited = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (visited.has(value)) {
    return '[CIRCULAR]';
  }
  visited.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactObject(item, visited));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      sensitiveKeyPattern.test(key) ? '[REDACTED]' : redactObject(item, visited),
    ]),
  );
}

export interface LoggerContext {
  readonly service: string;
  readonly environment: string;
  readonly level: NonNullable<LoggerOptions['level']>;
}

export function createLogger(context: LoggerContext, destination?: DestinationStream): Logger {
  const options: LoggerOptions = {
    level: context.level,
    base: {
      service: context.service,
      environment: context.environment,
    },
    messageKey: 'message',
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      log(object) {
        return redactObject(object) as Record<string, unknown>;
      },
    },
    redact: {
      paths: [...REDACTED_LOG_PATHS],
      censor: '[REDACTED]',
    },
  };

  return destination === undefined ? pino(options) : pino(options, destination);
}
