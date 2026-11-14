import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';

import {
  CatalogProductSchema,
  CreateOfferInputSchema,
  EventEnvelopeSchema,
  ListProductsInputSchema,
  SubmitProductInputSchema,
  ProductSubmissionChangedV1PayloadSchema,
} from '@atlas/contracts';
import type { Pool } from 'pg';

import { escapeCatalogSearch, seedSyntheticCatalog } from '../src/index.js';

describe('seller catalog boundaries', () => {
  it('limits product authoring to text proposals and a safe application-owned placeholder', () => {
    const input = {
      requestId: randomUUID(),
      categoryId: randomUUID(),
      title: { fr: 'Test', ar: 'تجربة' },
      description: { fr: 'Test', ar: 'تجربة' },
    };
    assert.equal(SubmitProductInputSchema.safeParse(input).success, true);
    for (const extra of [
      { sellerId: randomUUID() },
      { status: 'APPROVED' },
      { productId: randomUUID() },
      { imageUrl: '/assets/product-placeholder.svg' },
    ])
      assert.equal(SubmitProductInputSchema.safeParse({ ...input, ...extra }).success, false);
    assert.equal(
      CatalogProductSchema.shape.imageUrl.safeParse('/assets/product-placeholder.svg').success,
      true,
    );
    assert.equal(
      CatalogProductSchema.shape.imageUrl.safeParse('/assets/untrusted.svg').success,
      false,
    );
    assert.equal(
      ProductSubmissionChangedV1PayloadSchema.safeParse({
        id: randomUUID(),
        sellerId: randomUUID(),
        status: 'PENDING_REVIEW',
        productId: null,
        description: 'private text',
      }).success,
      false,
    );
  });
  it('escapes SQL wildcard characters so search terms remain literal', () => {
    assert.equal(escapeCatalogSearch('50%_\\test'), '50\\%\\_\\\\test');
  });

  it('rejects client seller overrides, fractional money, excessive queries and remote assets', () => {
    const input = {
      productId: randomUUID(),
      priceMinor: 100,
      availableQuantity: 1,
      handlingDays: 2,
      deliveryFeeMinor: 0,
    };
    assert.equal(CreateOfferInputSchema.safeParse(input).success, true);
    assert.equal(
      CreateOfferInputSchema.safeParse({ ...input, sellerId: randomUUID() }).success,
      false,
    );
    assert.equal(CreateOfferInputSchema.safeParse({ ...input, priceMinor: 1.5 }).success, false);
    assert.equal(CreateOfferInputSchema.safeParse({ ...input, priceMinor: 0 }).success, false);
    assert.equal(ListProductsInputSchema.safeParse({ limit: 101 }).success, false);
    assert.equal(ListProductsInputSchema.safeParse({ query: 'a'.repeat(121) }).success, false);
    assert.equal(
      CatalogProductSchema.shape.imageUrl.safeParse('https://example.org/image.png').success,
      false,
    );
    assert.equal(
      CatalogProductSchema.shape.imageUrl.safeParse('/assets/../secret.png').success,
      false,
    );
  });

  it('registers minimal seller-fulfilled offer event payloads and rejects personal data', () => {
    const payload = {
      offerId: randomUUID(),
      sellerId: randomUUID(),
      productId: randomUUID(),
      variantId: randomUUID(),
      fulfillmentMethod: 'SELLER_FULFILLED',
    };
    const event = {
      eventId: randomUUID(),
      eventType: 'offer.created',
      eventVersion: 1,
      occurredAt: new Date().toISOString(),
      producer: 'atlas-api',
      aggregateType: 'offer',
      aggregateId: payload.offerId,
      aggregateVersion: 1,
      correlationId: randomUUID(),
      causationId: null,
      actor: { type: 'seller_user', id: randomUUID() },
      data: payload,
    };
    assert.equal(EventEnvelopeSchema.safeParse(event).success, true);
    assert.equal(
      EventEnvelopeSchema.safeParse({
        ...event,
        data: { ...payload, customerPhone: '+213000000000' },
      }).success,
      false,
    );
  });

  it('rejects synthetic seeding outside local/test before connecting', async () => {
    let connections = 0;
    const pool = {
      connect: () => {
        connections++;
        throw new Error('Must not connect');
      },
    } as unknown as Pool;
    for (const environment of ['production', 'staging', '', 'LOCAL']) {
      await assert.rejects(seedSyntheticCatalog(pool, environment), /restricted to LOCAL and TEST/);
    }
    assert.equal(connections, 0);
  });
});
