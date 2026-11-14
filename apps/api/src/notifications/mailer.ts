import type { RuntimeConfig } from '@atlas/platform';
import nodemailer, { type Transporter } from 'nodemailer';
import type { Logger } from 'pino';

export const MAILER = Symbol('atlas.mailer');

export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** SMTP delivery via any provider (Brevo, Mailjet, OVH, SES SMTP, Gmail Workspace…). */
export class SmtpMailer implements Mailer {
  private readonly transport: Transporter;

  public constructor(
    smtpUrl: string,
    private readonly from: string,
  ) {
    const url = new URL(smtpUrl);
    this.transport = nodemailer.createTransport({
      host: url.hostname,
      port: Number(url.port || (url.protocol === 'smtps:' ? 465 : 587)),
      secure: url.protocol === 'smtps:',
      requireTLS: url.protocol === 'smtp:',
      auth: url.username
        ? { user: decodeURIComponent(url.username), pass: decodeURIComponent(url.password) }
        : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }

  public async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, ...message });
  }
}

/** LOCAL/TEST: write the message to the log instead of sending it. */
export class LogMailer implements Mailer {
  public readonly sent: MailMessage[] = [];
  public constructor(private readonly logger?: Logger) {}
  public async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
    this.logger?.info({ mail: message }, 'LOCAL mail (not sent)');
  }
}

/** Release without SMTP configured: never leak message bodies (they contain reset links). */
export class UnconfiguredMailer implements Mailer {
  public constructor(private readonly logger: Logger) {}
  public async send(): Promise<void> {
    this.logger.error({ code: 'MAIL_NOT_CONFIGURED' }, 'SMTP_URL is not set; email was not sent');
  }
}

export function createMailer(config: RuntimeConfig, logger: Logger): Mailer {
  if (config.smtpUrl !== null) return new SmtpMailer(config.smtpUrl, config.mailFrom);
  return ['local', 'test'].includes(config.nodeEnv)
    ? new LogMailer(logger)
    : new UnconfiguredMailer(logger);
}

/** Fire-and-forget delivery that never fails the request that triggered it. */
export function deliver(mailer: Mailer, logger: Logger, message: MailMessage): void {
  void mailer.send(message).catch(() => {
    logger.warn({ code: 'MAIL_DELIVERY_FAILED' }, 'email delivery failed');
  });
}
