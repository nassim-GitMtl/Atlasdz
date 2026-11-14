import { randomUUID } from 'node:crypto';
import {
  CheckoutQuoteSchema,
  CorrelationIdSchema,
  CustomerOrderSchema,
  DeliveryContactSchema,
  EventEnvelopeSchema,
  SellerOrderSchema,
  SellerRejectionReasonSchema,
  ProcessSellerOrderInputSchema,
  UuidSchema,
  type CheckoutQuote,
  type CustomerOrder,
  type DeliveryContact,
  type SellerOrder,
  type SellerOrderSnapshot,
  type ProcessSellerOrderInput,
  type SellerRejectionReason,
  type SetSellerDeliveryRateInput,
} from '@atlas/contracts';
import type { Pool, PoolClient } from 'pg';
import { readCartSnapshot } from './cart-repository.js';
import {
  DeliveryWriteError,
  PostgresDeliveryRepository,
  resolveSellerDeliveryRate,
} from './delivery-repository.js';
import { validateCheckoutPolicy, type CheckoutPolicy } from './checkout-policy.js';

export class OrderWriteError extends Error {
  constructor(
    readonly code:
      | 'CHECKOUT_DISABLED'
      | 'QUOTE_CHANGED'
      | 'QUOTE_EXPIRED'
      | 'ORDER_NOT_FOUND'
      | 'ORDER_STATE_CONFLICT',
    // Shipping coverage is evaluated before any order or reservation is written.
  ) {
    super(code);
    this.name = 'OrderWriteError';
  }
}
type Actor = { type: 'customer' | 'seller_user' | 'service'; id: string };
async function transaction<T>(pool: Pool, run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let broken = false;
  try {
    await client.query('BEGIN');
    const result = await run(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      broken = true;
    }
    throw error;
  } finally {
    client.release(broken);
  }
}
const SELLER_JSON = `jsonb_build_object('id', so.id, 'orderId', so.order_id, 'status', so.status,
  'version', so.row_version, 'createdAt', to_char(so.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'acceptanceDeadline', to_char(so.acceptance_deadline AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'snapshot', so.snapshot,
  'dataClass',(SELECT CASE po.payment_state WHEN 'CASH_ON_DELIVERY' THEN 'live' ELSE 'synthetic' END
    FROM commerce.orders po WHERE po.id=so.order_id),
  'paymentState',(SELECT po.payment_state FROM commerce.orders po WHERE po.id=so.order_id),
  'deliveryContact',(SELECT cq.snapshot->'deliveryContact' FROM commerce.orders co
    JOIN commerce.checkout_quotes cq ON cq.id=co.quote_id WHERE co.id=so.order_id),
  'delivery',(SELECT CASE po.payment_state WHEN 'CASH_ON_DELIVERY' THEN 'SELLER_DELIVERY'
    ELSE 'LOCAL_TEST_NO_SHIPMENT' END FROM commerce.orders po WHERE po.id=so.order_id),
  'shipment',so.shipment,'rejectionReason',so.rejection_reason,
  'history',COALESCE((SELECT jsonb_agg(jsonb_build_object('version',h.version,'status',h.status,
    'attribution',CASE h.actor_type WHEN 'seller_user' THEN 'SELLER' WHEN 'customer' THEN 'CUSTOMER' ELSE 'SYSTEM' END,
    'occurredAt',to_char(h.occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'reason',h.reason) ORDER BY h.version)
    FROM commerce.seller_order_history h WHERE h.seller_order_id=so.id),'[]'::jsonb))`;
async function readOrder(
  db: Pool | PoolClient,
  customerId: string,
  orderId: string,
): Promise<CustomerOrder | null> {
  const result = await db.query<{ order: unknown }>(
    `SELECT jsonb_build_object('id',o.id,'quote',q.snapshot,
    'paymentState',o.payment_state,'sellerOrders',(SELECT jsonb_agg(${SELLER_JSON} ORDER BY so.seller_id)
      FROM commerce.seller_orders so WHERE so.order_id=o.id)) AS "order"
    FROM commerce.orders o JOIN commerce.checkout_quotes q ON q.id=o.quote_id
    WHERE o.customer_id=$1 AND o.id=$2`,
    [customerId, orderId],
  );
  return result.rows[0] ? CustomerOrderSchema.parse(result.rows[0].order) : null;
}
async function readSellerOrder(
  db: Pool | PoolClient,
  sellerId: string,
  id: string,
): Promise<SellerOrder | null> {
  const result = await db.query<{ order: unknown }>(
    `SELECT ${SELLER_JSON} AS "order" FROM commerce.seller_orders so WHERE so.id=$1 AND so.seller_id=$2`,
    [id, sellerId],
  );
  return result.rows[0] ? SellerOrderSchema.parse(result.rows[0].order) : null;
}
async function clock(client: PoolClient): Promise<Date> {
  const result = await client.query<{ now: Date }>(
    "SELECT date_trunc('milliseconds',clock_timestamp()) AS now",
  );
  const now = result.rows[0]?.now;
  if (!now) throw new Error('Database clock unavailable');
  return now;
}
// All checkout mutations lock cart -> ordered sellers -> ordered offers; offer administration
// also acquires seller before offer. No stock is reserved by quote creation.
async function lockedTerms(
  client: PoolClient,
  customerId: string,
  version: number,
  destinationId: string,
  live: boolean,
): Promise<SellerOrderSnapshot[]> {
  const cart = await client.query<{ row_version: number }>(
    'SELECT row_version FROM commerce.carts WHERE customer_id=$1 FOR UPDATE',
    [customerId],
  );
  if (cart.rows[0]?.row_version !== version) throw new OrderWriteError('QUOTE_CHANGED');
  const ids = await client.query<{ id: string }>(
    'SELECT offer_id AS id FROM commerce.cart_items WHERE customer_id=$1 ORDER BY offer_id',
    [customerId],
  );
  const offerIds = ids.rows.map((row) => row.id);
  if (offerIds.length === 0 || offerIds.length > 50) throw new OrderWriteError('QUOTE_CHANGED');
  await client.query(
    `SELECT id FROM sellers.sellers WHERE id IN (SELECT seller_id FROM offers.offers WHERE id=ANY($1::uuid[])) ORDER BY id FOR UPDATE`,
    [offerIds],
  );
  const locked = await client.query<{
    id: string;
    row_version: number;
    synthetic: boolean;
    any_synthetic: boolean;
  }>(
    `SELECT o.id,o.row_version,(s.is_synthetic AND p.is_synthetic AND c.is_synthetic) AS synthetic,
      (s.is_synthetic OR p.is_synthetic OR c.is_synthetic) AS any_synthetic
    FROM offers.offers o JOIN sellers.sellers s ON s.id=o.seller_id
    JOIN catalog.products p ON p.id=o.product_id JOIN catalog.categories c ON c.id=p.category_id
    WHERE o.id=ANY($1::uuid[]) ORDER BY o.id FOR UPDATE OF o FOR SHARE OF p,c`,
    [offerIds],
  );
  // Synthetic fixtures and live inventory can never be mixed in one order.
  if (
    locked.rows.length !== offerIds.length ||
    locked.rows.some((row) => (live ? row.any_synthetic : !row.synthetic))
  )
    throw new OrderWriteError('CHECKOUT_DISABLED');
  const snapshot = await readCartSnapshot(client, customerId);
  const groups = new Map<string, SellerOrderSnapshot>();
  for (const line of snapshot.items) {
    if (line.state !== 'AVAILABLE' || !line.offer || !line.product)
      throw new OrderWriteError('QUOTE_CHANGED');
    const offer = line.offer;
    const product = line.product;
    const rowVersion = locked.rows.find((row) => row.id === offer.id)?.row_version;
    if (!rowVersion) throw new OrderWriteError('QUOTE_CHANGED');
    let group = groups.get(offer.seller.id);
    if (!group) {
      group = {
        sellerId: offer.seller.id,
        sellerName: offer.seller.name,
        items: [],
        itemsSubtotalMinor: 0,
        shippingFeeMinor: 0,
        totalMinor: 0,
      };
      groups.set(group.sellerId, group);
    }
    group.items.push({
      offerId: offer.id,
      productId: product.id,
      title: product.title,
      imageUrl: product.imageUrl,
      quantity: line.quantity,
      unitPriceMinor: offer.priceMinor,
      offerVersion: rowVersion,
      handlingDays: offer.handlingDays,
    });
    group.itemsSubtotalMinor += offer.priceMinor * line.quantity;
  }
  for (const group of groups.values()) {
    const rate = await resolveSellerDeliveryRate(client, group.sellerId, destinationId);
    if (!rate?.enabled) throw new DeliveryWriteError('DELIVERY_UNAVAILABLE');
    group.shippingFeeMinor = rate.shippingFeeMinor;
    group.totalMinor = group.itemsSubtotalMinor + rate.shippingFeeMinor;
    group.deliveryRate = {
      id: rate.id,
      version: rate.version,
      destination: rate.destination,
      codCollector: rate.codCollector,
    };
  }
  return [...groups.values()]
    .sort((a, b) => a.sellerId.localeCompare(b.sellerId))
    .map((group) => ({
      ...group,
      items: group.items.sort((a, b) => a.offerId.localeCompare(b.offerId)),
    }));
}
async function evidence(
  client: PoolClient,
  order: SellerOrder,
  actor: Actor,
  correlationId: string,
  reason: string,
) {
  const occurredAt = (await clock(client)).toISOString();
  const event = EventEnvelopeSchema.parse({
    eventId: randomUUID(),
    eventType:
      reason === 'PLACED'
        ? 'seller_order.routed'
        : ['REJECTED', 'CANCELLED', 'EXPIRED', 'DELIVERED', 'DELIVERY_FAILED'].includes(
              order.status,
            )
          ? 'seller_order.closed'
          : 'seller_order.progressed',
    eventVersion: 1,
    occurredAt,
    producer: 'atlas-api',
    aggregateType: 'seller_order',
    aggregateId: order.id,
    aggregateVersion: order.version,
    correlationId,
    causationId: null,
    actor,
    data: {
      orderId: order.orderId,
      sellerOrderId: order.id,
      sellerId: order.snapshot.sellerId,
      status: order.status,
      dataClass: order.dataClass,
    },
  });
  await client.query(
    'INSERT INTO commerce.seller_order_history(seller_order_id,version,status,actor_type,actor_id,occurred_at,reason) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [order.id, order.version, order.status, actor.type, actor.id, occurredAt, reason],
  );
  await client.query(
    `INSERT INTO platform.audit_events(occurred_at,actor_type,actor_id,scope_snapshot,action,outcome,entity_type,entity_id,entity_version,correlation_id,after_data)
    VALUES($1,$2,$3,$4,$5,'SUCCEEDED','seller_order',$6,$7,$8,$9)`,
    [
      occurredAt,
      actor.type,
      actor.id,
      JSON.stringify(
        actor.type === 'seller_user'
          ? { type: 'SELLER', id: order.snapshot.sellerId }
          : { type: 'GLOBAL' },
      ),
      event.eventType,
      order.id,
      order.version,
      correlationId,
      JSON.stringify({ ...event.data, reason }),
    ],
  );
  await client.query(
    `INSERT INTO platform.outbox_events(event_id,event_type,event_version,producer,aggregate_type,aggregate_id,aggregate_version,payload,actor_type,actor_id,correlation_id,occurred_at)
    VALUES($1,$2,1,'atlas-api','seller_order',$3,$4,$5,$6,$7,$8,$9)`,
    [
      event.eventId,
      event.eventType,
      order.id,
      order.version,
      JSON.stringify(event.data),
      actor.type,
      actor.id,
      correlationId,
      occurredAt,
    ],
  );
}

export class PostgresOrderRepository {
  private readonly policy: CheckoutPolicy | null;
  private readonly delivery: PostgresDeliveryRepository;
  constructor(
    private readonly pool: Pool,
    policy: CheckoutPolicy | null = null,
  ) {
    if (policy) {
      validateCheckoutPolicy(policy);
      if (policy.environment !== 'live') UuidSchema.parse(policy.customerId);
    }
    this.policy = policy ? Object.freeze({ ...policy }) : null;
    this.delivery = new PostgresDeliveryRepository(pool, policy?.environment ?? null);
  }
  /** Whether an existing order (by owner and payment state) belongs to this checkout mode. */
  private owns(customerId: string, paymentState: string): boolean {
    if (!this.policy) return false;
    if (this.policy.environment === 'live') return paymentState === 'CASH_ON_DELIVERY';
    return paymentState === 'NOT_APPLICABLE_TEST' && customerId === this.policy.customerId;
  }
  listDestinations() {
    return this.delivery.listDestinations();
  }
  listSellerRates(sellerId: string) {
    return this.delivery.listSellerRates(sellerId);
  }
  setSellerRate(
    sellerId: string,
    actorId: string,
    destinationId: string,
    input: SetSellerDeliveryRateInput,
    correlationId: string,
  ) {
    return this.delivery.setSellerRate(sellerId, actorId, destinationId, input, correlationId);
  }
  private enabled(customerId: string): CheckoutPolicy {
    UuidSchema.parse(customerId);
    if (
      !this.policy ||
      (this.policy.environment !== 'live' && this.policy.customerId !== customerId)
    )
      throw new OrderWriteError('CHECKOUT_DISABLED');
    return this.policy;
  }
  async createQuote(
    customerId: string,
    expectedVersion: number,
    destinationId: string,
    deliveryContact: DeliveryContact,
  ): Promise<CheckoutQuote> {
    const policy = this.enabled(customerId);
    UuidSchema.parse(destinationId);
    const contact = DeliveryContactSchema.parse(deliveryContact);
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1)
      throw new OrderWriteError('QUOTE_CHANGED');
    return transaction(this.pool, async (client) => {
      const sellers = await lockedTerms(
        client,
        customerId,
        expectedVersion,
        destinationId,
        policy.environment === 'live',
      );
      const now = await clock(client);
      const quote = CheckoutQuoteSchema.parse({
        id: randomUUID(),
        cartVersion: expectedVersion,
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + policy.quoteLifetimeSeconds * 1000).toISOString(),
        currency: 'DZD',
        totalMinor: sellers.reduce((sum, seller) => sum + seller.totalMinor, 0),
        dataClass: policy.environment === 'live' ? 'live' : 'synthetic',
        paymentArrangement:
          policy.environment === 'live' ? 'CASH_ON_DELIVERY' : 'TEST_ONLY_NO_PAYMENT',
        delivery: policy.environment === 'live' ? 'SELLER_DELIVERY' : 'LOCAL_TEST_NO_SHIPMENT',
        destination: sellers[0]?.deliveryRate?.destination,
        deliveryContact: contact,
        policy: {
          revision:
            policy.environment === 'live' ? 'live-destination-cod-v1' : 'local-destination-cod-v2',
          shippingRule: 'ONE_SELLER_CHARGE_PER_ORDER_DESTINATION',
          codModel: 'SELLER_OR_COURIER_COLLECTS',
          acceptanceWindowSeconds: policy.acceptanceWindowSeconds,
        },
        sellers,
      });
      await client.query(
        'INSERT INTO commerce.checkout_quotes(id,customer_id,cart_version,snapshot,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6)',
        [
          quote.id,
          customerId,
          quote.cartVersion,
          JSON.stringify(quote),
          quote.createdAt,
          quote.expiresAt,
        ],
      );
      return quote;
    });
  }
  async getQuote(customerId: string, id: string): Promise<CheckoutQuote | null> {
    UuidSchema.parse(customerId);
    UuidSchema.parse(id);
    const result = await this.pool.query<{ snapshot: unknown }>(
      'SELECT snapshot FROM commerce.checkout_quotes WHERE id=$1 AND customer_id=$2',
      [id, customerId],
    );
    return result.rows[0] ? CheckoutQuoteSchema.parse(result.rows[0].snapshot) : null;
  }
  async place(customerId: string, quoteId: string, correlationId: string): Promise<CustomerOrder> {
    const policy = this.enabled(customerId);
    const live = policy.environment === 'live';
    UuidSchema.parse(quoteId);
    CorrelationIdSchema.parse(correlationId);
    return transaction(this.pool, async (client) => {
      const result = await client.query<{ snapshot: unknown }>(
        'SELECT snapshot FROM commerce.checkout_quotes WHERE id=$1 AND customer_id=$2 FOR UPDATE',
        [quoteId, customerId],
      );
      if (!result.rows[0]) throw new OrderWriteError('ORDER_NOT_FOUND');
      const existing = await client.query<{ id: string }>(
        'SELECT id FROM commerce.orders WHERE quote_id=$1 AND customer_id=$2',
        [quoteId, customerId],
      );
      if (existing.rows[0]) {
        const order = await readOrder(client, customerId, existing.rows[0].id);
        if (order) return order;
        throw new Error('Order snapshot missing');
      }
      const quote = CheckoutQuoteSchema.parse(result.rows[0].snapshot);
      if ((quote.dataClass === 'live') !== live) throw new OrderWriteError('QUOTE_CHANGED');
      // Old unplaced fixture quotes must be replaced; already-placed retries returned above.
      if (!quote.destination || !quote.deliveryContact) throw new OrderWriteError('QUOTE_CHANGED');
      const terms = await lockedTerms(
        client,
        customerId,
        quote.cartVersion,
        quote.destination.id,
        live,
      );
      const now = await clock(client);
      if (new Date(quote.expiresAt).getTime() <= now.getTime())
        throw new OrderWriteError('QUOTE_EXPIRED');
      if (JSON.stringify(terms) !== JSON.stringify(quote.sellers))
        throw new OrderWriteError('QUOTE_CHANGED');
      const id = randomUUID();
      await client.query(
        'INSERT INTO commerce.orders(id,customer_id,quote_id,payment_state) VALUES($1,$2,$3,$4)',
        [id, customerId, quoteId, live ? 'CASH_ON_DELIVERY' : 'NOT_APPLICABLE_TEST'],
      );
      for (const seller of quote.sellers) {
        const sellerOrder = SellerOrderSchema.parse({
          id: randomUUID(),
          orderId: id,
          status: 'AWAITING_SELLER',
          version: 1,
          createdAt: now.toISOString(),
          acceptanceDeadline: new Date(
            now.getTime() + quote.policy.acceptanceWindowSeconds * 1000,
          ).toISOString(),
          snapshot: seller,
          deliveryContact: quote.deliveryContact,
          dataClass: live ? 'live' : 'synthetic',
          paymentState: live ? 'CASH_ON_DELIVERY' : 'NOT_APPLICABLE_TEST',
          delivery: live ? 'SELLER_DELIVERY' : 'LOCAL_TEST_NO_SHIPMENT',
          shipment: null,
          rejectionReason: null,
          history: [],
        });
        await client.query(
          `INSERT INTO commerce.seller_orders(id,order_id,seller_id,snapshot,created_at,acceptance_deadline) VALUES($1,$2,$3,$4,$5,$6)`,
          [
            sellerOrder.id,
            id,
            seller.sellerId,
            JSON.stringify(seller),
            sellerOrder.createdAt,
            sellerOrder.acceptanceDeadline,
          ],
        );
        for (const item of seller.items) {
          const reserved = await client.query(
            `UPDATE offers.offers SET available_quantity=available_quantity-$2,row_version=row_version+1 WHERE id=$1 AND available_quantity >= $2`,
            [item.offerId, item.quantity],
          );
          if (reserved.rowCount !== 1) throw new OrderWriteError('QUOTE_CHANGED');
          await client.query(
            'INSERT INTO commerce.stock_reservations(seller_order_id,offer_id,seller_id,quantity) VALUES($1,$2,$3,$4)',
            [sellerOrder.id, item.offerId, seller.sellerId, item.quantity],
          );
        }
        await evidence(
          client,
          sellerOrder,
          { type: 'customer', id: customerId },
          correlationId,
          'PLACED',
        );
      }
      await client.query('DELETE FROM commerce.cart_items WHERE customer_id=$1', [customerId]);
      await client.query(
        'UPDATE commerce.carts SET row_version=row_version+1,updated_at=clock_timestamp() WHERE customer_id=$1',
        [customerId],
      );
      const order = await readOrder(client, customerId, id);
      if (!order) throw new Error('Order snapshot missing');
      return order;
    });
  }
  async getCustomerOrder(customerId: string, id: string) {
    return readOrder(this.pool, UuidSchema.parse(customerId), UuidSchema.parse(id));
  }
  async listCustomerOrders(customerId: string): Promise<CustomerOrder[]> {
    const ids = await this.pool.query<{ id: string }>(
      'SELECT id FROM commerce.orders WHERE customer_id=$1 ORDER BY created_at DESC,id LIMIT 50',
      [UuidSchema.parse(customerId)],
    );
    const orders = await Promise.all(
      ids.rows.map((row) => readOrder(this.pool, customerId, row.id)),
    );
    return orders.filter((order): order is CustomerOrder => order !== null);
  }
  async listSellerOrders(sellerId: string): Promise<SellerOrder[]> {
    const result = await this.pool.query<{ order: unknown }>(
      `SELECT ${SELLER_JSON} AS "order" FROM commerce.seller_orders so WHERE so.seller_id=$1 ORDER BY so.created_at DESC,so.id LIMIT 100`,
      [UuidSchema.parse(sellerId)],
    );
    return result.rows.map((row) => SellerOrderSchema.parse(row.order));
  }
  async getSellerOrder(sellerId: string, id: string) {
    return readSellerOrder(this.pool, UuidSchema.parse(sellerId), UuidSchema.parse(id));
  }

  async closeSellerOrder(input: {
    sellerOrderId: string;
    actor: Actor;
    scopeId?: string;
    expectedVersion: number;
    reason: 'CUSTOMER_CANCELLED' | 'SELLER_REJECTED' | 'DEADLINE_EXPIRED';
    rejectionReason?: SellerRejectionReason;
    correlationId: string;
  }): Promise<SellerOrder> {
    if (!this.policy) throw new OrderWriteError('CHECKOUT_DISABLED');
    if (
      input.reason === 'SELLER_REJECTED' &&
      !SellerRejectionReasonSchema.safeParse(input.rejectionReason).success
    )
      throw new OrderWriteError('ORDER_STATE_CONFLICT');
    UuidSchema.parse(input.sellerOrderId);
    UuidSchema.parse(input.actor.id);
    CorrelationIdSchema.parse(input.correlationId);
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1)
      throw new OrderWriteError('ORDER_STATE_CONFLICT');
    if (
      (input.reason === 'CUSTOMER_CANCELLED' && input.actor.type !== 'customer') ||
      (input.reason === 'SELLER_REJECTED' && input.actor.type !== 'seller_user') ||
      (input.reason === 'DEADLINE_EXPIRED' && input.actor.type !== 'service')
    )
      throw new OrderWriteError('ORDER_NOT_FOUND');
    return transaction(this.pool, async (client) => {
      const located = await client.query<{
        order_id: string;
        seller_id: string;
        customer_id: string;
        payment_state: string;
      }>(
        `SELECT so.order_id,so.seller_id,o.customer_id,o.payment_state FROM commerce.seller_orders so JOIN commerce.orders o ON o.id=so.order_id
        WHERE so.id=$1 AND (($2='customer' AND o.customer_id=$3) OR ($2='seller_user' AND so.seller_id=$4) OR $2='service')`,
        [input.sellerOrderId, input.actor.type, input.actor.id, input.scopeId ?? null],
      );
      const owner = located.rows[0];
      if (!owner || !this.owns(owner.customer_id, owner.payment_state))
        throw new OrderWriteError('ORDER_NOT_FOUND');
      await client.query('SELECT id FROM commerce.orders WHERE id=$1 FOR UPDATE', [owner.order_id]);
      await client.query('SELECT id FROM sellers.sellers WHERE id=$1 FOR UPDATE', [
        owner.seller_id,
      ]);
      await client.query('SELECT id FROM commerce.seller_orders WHERE id=$1 FOR UPDATE', [
        input.sellerOrderId,
      ]);
      const current = await readSellerOrder(client, owner.seller_id, input.sellerOrderId);
      if (!current) throw new OrderWriteError('ORDER_NOT_FOUND');
      const status =
        input.reason === 'CUSTOMER_CANCELLED'
          ? 'CANCELLED'
          : input.reason === 'SELLER_REJECTED'
            ? 'REJECTED'
            : 'EXPIRED';
      if (current.status === status) {
        if (status === 'REJECTED' && current.rejectionReason !== input.rejectionReason)
          throw new OrderWriteError('ORDER_STATE_CONFLICT');
        return current;
      }
      if (current.status !== 'AWAITING_SELLER' || current.version !== input.expectedVersion)
        throw new OrderWriteError('ORDER_STATE_CONFLICT');
      const now = await clock(client);
      if (status === 'EXPIRED' && new Date(current.acceptanceDeadline).getTime() > now.getTime())
        throw new OrderWriteError('ORDER_STATE_CONFLICT');
      const reservations = await client.query<{ offer_id: string; quantity: number }>(
        `SELECT r.offer_id,r.quantity FROM commerce.stock_reservations r JOIN offers.offers o ON o.id=r.offer_id
        WHERE r.seller_order_id=$1 AND r.released_at IS NULL ORDER BY o.id FOR UPDATE OF o,r`,
        [current.id],
      );
      for (const reservation of reservations.rows)
        await client.query(
          'UPDATE offers.offers SET available_quantity=available_quantity+$2,row_version=row_version+1 WHERE id=$1',
          [reservation.offer_id, reservation.quantity],
        );
      await client.query(
        'UPDATE commerce.stock_reservations SET released_at=$2 WHERE seller_order_id=$1 AND released_at IS NULL',
        [current.id, now],
      );
      await client.query(
        'UPDATE commerce.seller_orders SET status=$2,row_version=row_version+1,closed_at=$3,rejection_reason=$4 WHERE id=$1',
        [current.id, status, now, status === 'REJECTED' ? input.rejectionReason : null],
      );
      const updated = await readSellerOrder(client, owner.seller_id, current.id);
      if (!updated) throw new Error('Seller order missing');
      await evidence(
        client,
        updated,
        input.actor,
        input.correlationId,
        input.rejectionReason ?? input.reason,
      );
      return (await readSellerOrder(client, owner.seller_id, current.id)) as SellerOrder;
    });
  }
  async processSellerOrder(input: {
    sellerOrderId: string;
    sellerId: string;
    actorId: string;
    command: ProcessSellerOrderInput;
    correlationId: string;
  }): Promise<SellerOrder> {
    const command = ProcessSellerOrderInputSchema.parse(input.command);
    return this.transition({
      id: input.sellerOrderId,
      scopeId: input.sellerId,
      actor: { type: 'seller_user', id: input.actorId },
      command,
      correlationId: input.correlationId,
    });
  }
  async confirmDelivery(input: {
    sellerOrderId: string;
    customerId: string;
    expectedVersion: number;
    correlationId: string;
  }): Promise<SellerOrder> {
    return this.transition({
      id: input.sellerOrderId,
      actor: { type: 'customer', id: input.customerId },
      command: { action: 'CONFIRM_DELIVERY', expectedVersion: input.expectedVersion },
      correlationId: input.correlationId,
    });
  }
  private async transition(input: {
    id: string;
    scopeId?: string;
    actor: Actor;
    command: ProcessSellerOrderInput | { action: 'CONFIRM_DELIVERY'; expectedVersion: number };
    correlationId: string;
  }): Promise<SellerOrder> {
    if (!this.policy) throw new OrderWriteError('CHECKOUT_DISABLED');
    UuidSchema.parse(input.id);
    UuidSchema.parse(input.actor.id);
    CorrelationIdSchema.parse(input.correlationId);
    if (!Number.isSafeInteger(input.command.expectedVersion) || input.command.expectedVersion < 1)
      throw new OrderWriteError('ORDER_STATE_CONFLICT');
    const flow = {
      ACCEPT: ['AWAITING_SELLER', 'ACCEPTED'],
      PREPARE: ['ACCEPTED', 'PREPARING'],
      SHIP: ['PREPARING', 'SHIPPED'],
      REPORT_DELIVERY: ['SHIPPED', 'DELIVERY_REPORTED'],
      REPORT_DELIVERY_FAILED: ['SHIPPED', 'DELIVERY_FAILED'],
      CONFIRM_DELIVERY: ['DELIVERY_REPORTED', 'DELIVERED'],
    } as const;
    const [from, to] = flow[input.command.action];
    return transaction(this.pool, async (client) => {
      const located = await client.query<{
        order_id: string;
        seller_id: string;
        customer_id: string;
        payment_state: string;
      }>(
        `SELECT so.order_id,so.seller_id,o.customer_id,o.payment_state FROM commerce.seller_orders so JOIN commerce.orders o ON o.id=so.order_id WHERE so.id=$1 AND (($2='customer' AND o.customer_id=$3) OR ($2='seller_user' AND so.seller_id=$4))`,
        [input.id, input.actor.type, input.actor.id, input.scopeId ?? null],
      );
      const owner = located.rows[0];
      if (!owner || !this.owns(owner.customer_id, owner.payment_state))
        throw new OrderWriteError('ORDER_NOT_FOUND');
      await client.query('SELECT id FROM commerce.orders WHERE id=$1 FOR UPDATE', [owner.order_id]);
      const seller = await client.query<{ status: string }>(
        'SELECT status FROM sellers.sellers WHERE id=$1 FOR UPDATE',
        [owner.seller_id],
      );
      if (input.actor.type === 'seller_user' && seller.rows[0]?.status !== 'APPROVED')
        throw new OrderWriteError('ORDER_STATE_CONFLICT');
      await client.query('SELECT id FROM commerce.seller_orders WHERE id=$1 FOR UPDATE', [
        input.id,
      ]);
      const current = await readSellerOrder(client, owner.seller_id, input.id);
      if (!current) throw new OrderWriteError('ORDER_NOT_FOUND');
      if (current.status === to && current.version === input.command.expectedVersion + 1) {
        if (
          input.command.action === 'SHIP' &&
          JSON.stringify(current.shipment) !== JSON.stringify(input.command.shipment)
        )
          throw new OrderWriteError('ORDER_STATE_CONFLICT');
        return current;
      }
      if (current.status !== from || current.version !== input.command.expectedVersion)
        throw new OrderWriteError('ORDER_STATE_CONFLICT');
      const now = await clock(client);
      if (
        input.command.action === 'ACCEPT' &&
        new Date(current.acceptanceDeadline).getTime() <= now.getTime()
      )
        throw new OrderWriteError('ORDER_STATE_CONFLICT');
      if (input.command.action === 'SHIP') {
        const expectedMethod =
          current.dataClass === 'live' ? 'SELLER_ARRANGED' : 'SELLER_ARRANGED_TEST';
        if (input.command.shipment.method !== expectedMethod)
          throw new OrderWriteError('ORDER_STATE_CONFLICT');
        const consumed = await client.query(
          'UPDATE commerce.stock_reservations SET consumed_at=$2 WHERE seller_order_id=$1 AND released_at IS NULL AND consumed_at IS NULL',
          [current.id, now],
        );
        if (consumed.rowCount !== current.snapshot.items.length)
          throw new OrderWriteError('ORDER_STATE_CONFLICT');
      }
      await client.query(
        'UPDATE commerce.seller_orders SET status=$2,row_version=row_version+1,shipment=$3,closed_at=$4 WHERE id=$1',
        [
          current.id,
          to,
          input.command.action === 'SHIP'
            ? JSON.stringify(input.command.shipment)
            : current.shipment,
          ['DELIVERED', 'DELIVERY_FAILED'].includes(to) ? now : null,
        ],
      );
      const updated = await readSellerOrder(client, owner.seller_id, current.id);
      if (!updated) throw new Error('Order transition missing');
      await evidence(client, updated, input.actor, input.correlationId, input.command.action);
      return (await readSellerOrder(client, owner.seller_id, current.id)) as SellerOrder;
    });
  }
  async expireDue(): Promise<number> {
    if (!this.policy) throw new OrderWriteError('CHECKOUT_DISABLED');
    const due = await this.pool.query<{ id: string; row_version: number }>(
      this.policy.environment === 'live'
        ? `SELECT so.id,so.row_version FROM commerce.seller_orders so JOIN commerce.orders o ON o.id=so.order_id
          WHERE so.status='AWAITING_SELLER' AND so.acceptance_deadline<=clock_timestamp()
            AND o.payment_state='CASH_ON_DELIVERY' ORDER BY so.acceptance_deadline,so.id LIMIT 100`
        : `SELECT so.id,so.row_version FROM commerce.seller_orders so JOIN commerce.orders o ON o.id=so.order_id
          WHERE so.status='AWAITING_SELLER' AND so.acceptance_deadline<=clock_timestamp() AND o.customer_id=$1
            AND o.payment_state='NOT_APPLICABLE_TEST' ORDER BY so.acceptance_deadline,so.id LIMIT 100`,
      this.policy.environment === 'live' ? [] : [this.policy.customerId],
    );
    let count = 0;
    for (const row of due.rows) {
      try {
        await this.closeSellerOrder({
          sellerOrderId: row.id,
          expectedVersion: row.row_version,
          reason: 'DEADLINE_EXPIRED',
          actor: { type: 'service', id: '70000000-0000-4000-8000-000000000090' },
          correlationId: randomUUID(),
        });
        count++;
      } catch (error) {
        if (!(error instanceof OrderWriteError && error.code === 'ORDER_STATE_CONFLICT'))
          throw error;
      }
    }
    return count;
  }
}
