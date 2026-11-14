import { z } from 'zod';

const falseOnlyFlag = z
  .enum(['false'])
  .default('false')
  .transform(() => false as const);

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['local', 'test', 'development', 'staging', 'production']).default('local'),
    SERVICE_NAME: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z][a-z0-9-]*$/)
      .default('atlas-api'),
    HOST: z.ipv4().default('127.0.0.1'),
    PORT: z.coerce.number().int().min(0).max(65_535).default(3000),
    LOG_LEVEL: z
      .enum(['silent', 'fatal', 'error', 'warn', 'info', 'debug', 'trace'])
      .default('info'),
    DATABASE_URL: z
      .string()
      .url()
      .refine(
        (value) => value.startsWith('postgresql://') || value.startsWith('postgres://'),
        'DATABASE_URL must use the PostgreSQL protocol',
      ),
    DATABASE_SSL: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    CORS_ALLOWED_ORIGINS: z.string().min(1),
    REQUEST_BODY_LIMIT_BYTES: z.coerce
      .number()
      .int()
      .min(1024)
      .max(10 * 1024 * 1024)
      .default(1024 * 1024),
    ENABLE_ELECTRONIC_PAYMENTS: falseOnlyFlag,
    ENABLE_REAL_PAYOUTS: falseOnlyFlag,
    // 32 random bytes, base64-encoded; encrypts TOTP seeds at rest.
    IDENTITY_SECRET_KEY: z
      .string()
      .regex(/^[A-Za-z0-9+/]{43}=$/)
      .optional(),
    // Outgoing mail (password reset, seller notifications): smtp(s)://user:pass@host:port
    SMTP_URL: z
      .string()
      .url()
      .refine((value) => /^smtps?:\/\//.test(value), 'SMTP_URL must use smtp:// or smtps://')
      .optional(),
    MAIL_FROM: z.string().min(3).max(200).optional(),
  })
  .strict()
  .transform((value) => ({
    nodeEnv: value.NODE_ENV,
    serviceName: value.SERVICE_NAME,
    host: value.HOST,
    port: value.PORT,
    logLevel: value.LOG_LEVEL,
    databaseUrl: value.DATABASE_URL,
    databaseSsl: value.DATABASE_SSL,
    corsAllowedOrigins: value.CORS_ALLOWED_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    requestBodyLimitBytes: value.REQUEST_BODY_LIMIT_BYTES,
    electronicPaymentsEnabled: value.ENABLE_ELECTRONIC_PAYMENTS,
    realPayoutsEnabled: value.ENABLE_REAL_PAYOUTS,
    identitySecretKey:
      value.IDENTITY_SECRET_KEY === undefined
        ? null
        : Buffer.from(value.IDENTITY_SECRET_KEY, 'base64'),
    smtpUrl: value.SMTP_URL ?? null,
    mailFrom: value.MAIL_FROM ?? 'Atlas DZ <no-reply@localhost>',
  }));

export type RuntimeConfig = z.infer<typeof environmentSchema>;

export class InvalidEnvironmentError extends Error {
  public constructor(public readonly invalidFields: readonly string[]) {
    super(`Invalid environment configuration: ${invalidFields.join(', ')}`);
    this.name = 'InvalidEnvironmentError';
  }
}

export function loadRuntimeConfig(source: NodeJS.ProcessEnv): RuntimeConfig {
  const knownSource = {
    NODE_ENV: source['NODE_ENV'],
    SERVICE_NAME: source['SERVICE_NAME'],
    HOST: source['HOST'],
    PORT: source['PORT'],
    LOG_LEVEL: source['LOG_LEVEL'],
    DATABASE_URL: source['DATABASE_URL'],
    DATABASE_SSL: source['DATABASE_SSL'],
    CORS_ALLOWED_ORIGINS: source['CORS_ALLOWED_ORIGINS'],
    REQUEST_BODY_LIMIT_BYTES: source['REQUEST_BODY_LIMIT_BYTES'],
    ENABLE_ELECTRONIC_PAYMENTS: source['ENABLE_ELECTRONIC_PAYMENTS'],
    ENABLE_REAL_PAYOUTS: source['ENABLE_REAL_PAYOUTS'],
    IDENTITY_SECRET_KEY: source['IDENTITY_SECRET_KEY'],
    SMTP_URL: source['SMTP_URL'],
    MAIL_FROM: source['MAIL_FROM'],
  };
  const result = environmentSchema.safeParse(knownSource);

  if (!result.success) {
    const invalidFields = [
      ...new Set(result.error.issues.map((issue) => issue.path.join('.'))),
    ].sort();
    throw new InvalidEnvironmentError(invalidFields);
  }

  if (result.data.corsAllowedOrigins.length === 0) {
    throw new InvalidEnvironmentError(['CORS_ALLOWED_ORIGINS']);
  }

  const release = ['staging', 'production'].includes(result.data.nodeEnv);
  const invalid = new Set<string>();
  for (const origin of result.data.corsAllowedOrigins) {
    try {
      const parsed = new URL(origin);
      if (
        parsed.origin !== origin ||
        parsed.username ||
        parsed.password ||
        !['http:', 'https:'].includes(parsed.protocol) ||
        (release && parsed.protocol !== 'https:')
      )
        invalid.add('CORS_ALLOWED_ORIGINS');
    } catch {
      invalid.add('CORS_ALLOWED_ORIGINS');
    }
  }
  if (release) {
    if (!result.data.databaseSsl) invalid.add('DATABASE_SSL');
    if (result.data.port === 0) invalid.add('PORT');
    if (result.data.identitySecretKey === null) invalid.add('IDENTITY_SECRET_KEY');
    const database = new URL(result.data.databaseUrl);
    // pg connection-string SSL options can override the explicit verified-TLS pool options.
    if ([...database.searchParams.keys()].some((key) => key.toLowerCase().startsWith('ssl')))
      invalid.add('DATABASE_URL');
    for (const key of ['ATLAS_LOCAL_ACCOUNTS', 'ATLAS_LOCAL_CHECKOUT']) {
      if (source[key] !== undefined && source[key] !== 'false') invalid.add(key);
    }
    if (
      source['NODE_TLS_REJECT_UNAUTHORIZED'] !== undefined &&
      source['NODE_TLS_REJECT_UNAUTHORIZED'] !== '1'
    )
      invalid.add('NODE_TLS_REJECT_UNAUTHORIZED');
  }
  if (invalid.size) throw new InvalidEnvironmentError([...invalid].sort());

  return result.data;
}
