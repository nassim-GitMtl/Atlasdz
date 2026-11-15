import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { api, ApiError } from './api';
import { API_URL, imageUri, SHOP_URL, webPage } from './config';
import { contactErrors, emptyContact } from './contact';
import { fill, formatMoney, formatTime, normalizePhone } from './format';
import { canCancel, canConfirmReceipt, statusTone } from './order-status';
import { errorMessage, strings } from './strings';

const photo = '/media/0b6a1c1e-9f6e-4c1e-8a7e-1d2c3b4a5f60.webp';

describe('config', () => {
  it('uses the local shop and API when no address is configured', () => {
    assert.equal(SHOP_URL, 'http://127.0.0.1:3001');
    assert.equal(API_URL, SHOP_URL);
  });
  it('picks the 640 px variant for seller photos in cards only', () => {
    assert.equal(
      imageUri(photo, 'small'),
      `${SHOP_URL}/media/0b6a1c1e-9f6e-4c1e-8a7e-1d2c3b4a5f60-640.webp`,
    );
    assert.equal(imageUri(photo, 'large'), `${SHOP_URL}${photo}`);
    assert.equal(
      imageUri('/assets/product-air-fryer.png', 'small'),
      `${SHOP_URL}/assets/product-air-fryer.png`,
    );
    assert.equal(webPage('/legal/conditions', 'ar'), `${SHOP_URL}/legal/conditions?lang=ar`);
  });
});

describe('api', () => {
  const reply = (status: number, body?: unknown) => async () =>
    new Response(body === undefined ? null : JSON.stringify(body), { status });

  it('sends the session token and JSON body, and returns the JSON reply', async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const result = await api<{ ok: boolean }>(
      '/api/v1/cart/items/x',
      { method: 'PUT', body: { quantity: 1 }, token: 'atlas-s1.t' },
      async (url, init) => {
        seen = { url, init };
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
    );
    assert.deepEqual(result, { ok: true });
    assert.equal(seen?.url, `${API_URL}/api/v1/cart/items/x`);
    assert.equal(seen?.init.method, 'PUT');
    assert.equal(seen?.init.body, '{"quantity":1}');
    const headers = seen?.init.headers as Record<string, string>;
    assert.equal(headers.authorization, 'Bearer atlas-s1.t');
    assert.equal(headers['content-type'], 'application/json');
  });
  it('turns API errors, expired sessions and network failures into codes', async () => {
    await assert.rejects(api('/x', {}, reply(403, { code: 'EMAIL_NOT_VERIFIED' })), {
      code: 'EMAIL_NOT_VERIFIED',
      status: 403,
    });
    await assert.rejects(api('/x', {}, reply(401)), { code: 'AUTHENTICATION_REQUIRED' });
    await assert.rejects(api('/x', {}, reply(502)), { code: 'HTTP_502' });
    await assert.rejects(
      api('/x', {}, async () => {
        throw new TypeError('Network request failed');
      }),
      (error: unknown) => error instanceof ApiError && error.code === 'NETWORK',
    );
  });
});

describe('format', () => {
  it('formats dinars like the website', () => {
    assert.match(formatMoney(450000, 'fr'), /4\s?500\s?DA/u);
    assert.match(formatMoney(450050, 'fr'), /4\s?500,50\s?DA/u);
    assert.match(formatMoney(450000, 'ar'), /د\.ج/u);
  });
  it('shows times on the 24-hour clock', () => {
    assert.match(formatTime('2026-11-13T14:05:00Z', 'fr'), /^\d{2}:05$/);
    assert.doesNotMatch(formatTime('2026-11-13T14:05:00Z', 'fr'), /AM|PM/);
  });
  it('fills placeholders and normalises phone numbers', () => {
    assert.equal(fill('{n} vendeur(s)', { n: 3 }), '3 vendeur(s)');
    assert.equal(fill('{missing}', {}), '{missing}');
    assert.equal(normalizePhone('0555 12-34.56'), '0555123456');
  });
});

describe('delivery contact', () => {
  it('accepts what the API accepts and flags the rest', () => {
    const good = {
      recipientName: 'Amina B.',
      phone: '0555 12 34 56',
      addressLine: '12 rue des Oliviers',
      city: 'Tlemcen',
    };
    assert.equal(contactErrors(good).size, 0);
    assert.deepEqual([...contactErrors(emptyContact)].sort(), [
      'addressLine',
      'city',
      'phone',
      'recipientName',
    ]);
    assert.ok(contactErrors({ ...good, phone: '12-34' }).has('phone'));
  });
});

describe('order status', () => {
  it('offers cancel before acceptance and receipt confirmation after reported delivery', () => {
    assert.ok(canCancel('AWAITING_SELLER'));
    assert.ok(!canCancel('ACCEPTED'));
    assert.ok(canConfirmReceipt('DELIVERY_REPORTED'));
    assert.ok(!canConfirmReceipt('SHIPPED'));
    assert.equal(statusTone('DELIVERED'), 'good');
    assert.equal(statusTone('EXPIRED'), 'bad');
  });
});

describe('strings', () => {
  const keys = (value: object, prefix = ''): string[] =>
    Object.entries(value).flatMap(([key, child]) =>
      typeof child === 'object' && child !== null
        ? keys(child as object, `${prefix}${key}.`)
        : [`${prefix}${key}`],
    );
  it('French and Arabic have exactly the same texts, none empty', () => {
    assert.deepEqual(keys(strings.ar).sort(), keys(strings.fr).sort());
    assert.deepEqual(keys(strings.en).sort(), keys(strings.fr).sort());
    for (const locale of ['fr', 'ar'] as const) {
      for (const key of keys(strings[locale])) {
        const value = key
          .split('.')
          .reduce<unknown>(
            (node, part) => (node as Record<string, unknown>)[part],
            strings[locale],
          );
        assert.ok(
          typeof value === 'string' && value.trim().length > 0,
          `${locale}.${key} is empty`,
        );
      }
    }
  });
  it('has a message for every error a customer can meet, and a fallback', () => {
    for (const code of [
      'EMAIL_NOT_VERIFIED',
      'PHONE_NOT_VERIFIED',
      'COD_LIMIT_REACHED',
      'COD_BLOCKED',
      'QUOTE_EXPIRED',
      'DELIVERY_UNAVAILABLE',
      'CART_CONFLICT',
      'NETWORK',
    ]) {
      assert.notEqual(errorMessage(strings.fr, code), strings.fr.errors.UNKNOWN, code);
    }
    assert.equal(errorMessage(strings.ar, 'SOMETHING_NEW'), strings.ar.errors.UNKNOWN);
  });
});
