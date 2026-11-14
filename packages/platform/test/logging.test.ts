import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { describe, it } from 'node:test';

import { createLogger } from '../src/logging.js';

describe('structured logging', () => {
  it('redacts nested credentials and prohibited payment data', () => {
    let output = '';
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    });
    const logger = createLogger(
      { service: 'atlas-api-test', environment: 'test', level: 'info' },
      sink,
    );

    logger.info(
      {
        authorization: 'Bearer secret-access-token',
        customer: { password: 'unsafe-password', otp: '123456' },
        payment: { pan: '4111111111111111', cvv: '123', pin: '9999' },
        quote: { deliveryContact: { arbitrary: 'private-contact-payload' } },
        support: { body: 'private-support-text' },
        nested: {
          recipientName: 'private-recipient',
          city: 'private-city',
          phone: '+00000000000',
          addressLine: 'private-street',
        },
      },
      'redaction-check',
    );

    assert.ok(output.includes('redaction-check'));
    assert.ok(output.includes('[REDACTED]'));
    for (const prohibited of [
      'secret-access-token',
      'unsafe-password',
      '123456',
      '4111111111111111',
      '9999',
      'private-contact-payload',
      'private-support-text',
      'private-recipient',
      'private-city',
      '+00000000000',
      'private-street',
    ]) {
      assert.equal(output.includes(prohibited), false);
    }
  });
});
