import { createHash, randomUUID } from 'node:crypto';
import {
  CorrelationIdSchema,
  DeliveryDestinationSchema,
  EventEnvelopeSchema,
  SellerDeliveryRateSchema,
  SetSellerDeliveryRateInputSchema,
  UuidSchema,
  type DeliveryDestination,
  type SellerDeliveryRate,
  type SetSellerDeliveryRateInput,
} from '@atlas/contracts';
import type { Pool, PoolClient } from 'pg';
import { readReferenceDeliveryTargets } from './reference-destinations.js';

export const SYNTHETIC_DELIVERY_IDS = Object.freeze({
  dataset: '80000000-0000-4000-8000-000000000001',
  wilaya: '80000000-0000-4000-8000-000000000002',
  destinations: [
    '80000000-0000-4000-8000-000000000003',
    '80000000-0000-4000-8000-000000000004',
  ] as const,
});
const fixtureDestinations = [
  {
    id: SYNTHETIC_DELIVERY_IDS.destinations[0],
    code: 'TEST-A',
    name: { fr: 'Destination fictive A', ar: 'وجهة تجريبية أ' },
  },
  {
    id: SYNTHETIC_DELIVERY_IDS.destinations[1],
    code: 'TEST-B',
    name: { fr: 'Destination fictive B', ar: 'وجهة تجريبية ب' },
  },
];
const sourceHash = createHash('sha256').update(JSON.stringify(fixtureDestinations)).digest('hex');
const sourceReference = 'urn:atlas:synthetic-shipping:no-geographic-authority:v1';
const sourceName = 'Atlas synthetic shipping fixtures — not Algerian location data';
export class DeliveryWriteError extends Error {
  constructor(
    readonly code: 'CHECKOUT_DISABLED' | 'DELIVERY_UNAVAILABLE' | 'DELIVERY_CONFLICT' | 'FORBIDDEN',
  ) {
    super(code);
    this.name = 'DeliveryWriteError';
  }
}
function enabled(environment: string | null): void {
  if (environment !== 'local' && environment !== 'test' && environment !== 'live')
    throw new DeliveryWriteError('CHECKOUT_DISABLED');
}
async function tx<T>(pool: Pool, work: (db: PoolClient) => Promise<T>): Promise<T> {
  const db = await pool.connect();
  let broken = false;
  try {
    await db.query('BEGIN');
    const result = await work(db);
    await db.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await db.query('ROLLBACK');
    } catch {
      broken = true;
    }
    throw error;
  } finally {
    db.release(broken);
  }
}
// Never activate the synthetic dataset as the authoritative Algerian location source.
export async function seedSyntheticDeliveryDestinations(
  pool: Pool,
  environment: string,
): Promise<void> {
  enabled(environment);
  await tx(pool, async (db) => {
    await db.query(
      `INSERT INTO locations.dataset_versions(id,version_code,source_name,source_reference,source_sha256,is_active)
      VALUES($1,'atlas-synthetic-shipping-v1',$2,$3,$4,false) ON CONFLICT DO NOTHING`,
      [SYNTHETIC_DELIVERY_IDS.dataset, sourceName, sourceReference, sourceHash],
    );
    const dataset = await db.query(
      `SELECT 1 FROM locations.dataset_versions WHERE id=$1
      AND version_code='atlas-synthetic-shipping-v1' AND source_name=$2 AND source_reference=$3
      AND source_sha256=$4 AND NOT is_active FOR UPDATE`,
      [SYNTHETIC_DELIVERY_IDS.dataset, sourceName, sourceReference, sourceHash],
    );
    if (dataset.rowCount !== 1) throw new Error('Synthetic delivery dataset provenance conflict');
    await db.query(
      `INSERT INTO locations.wilayas(id,dataset_version_id,code,name_fr,name_ar)
      VALUES($1,$2,'00','Wilaya fictive sans réalité géographique','ولاية تجريبية غير حقيقية') ON CONFLICT DO NOTHING`,
      [SYNTHETIC_DELIVERY_IDS.wilaya, SYNTHETIC_DELIVERY_IDS.dataset],
    );
    const wilaya = await db.query(
      `SELECT 1 FROM locations.wilayas WHERE id=$1 AND dataset_version_id=$2
      AND code='00' AND name_fr='Wilaya fictive sans réalité géographique'
      AND name_ar='ولاية تجريبية غير حقيقية' AND is_active FOR SHARE`,
      [SYNTHETIC_DELIVERY_IDS.wilaya, SYNTHETIC_DELIVERY_IDS.dataset],
    );
    if (wilaya.rowCount !== 1) throw new Error('Synthetic delivery wilaya conflict');
    for (const destination of fixtureDestinations) {
      await db.query(
        `INSERT INTO locations.communes(id,dataset_version_id,wilaya_id,code,name_fr,name_ar)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
        [
          destination.id,
          SYNTHETIC_DELIVERY_IDS.dataset,
          SYNTHETIC_DELIVERY_IDS.wilaya,
          destination.code,
          destination.name.fr,
          destination.name.ar,
        ],
      );
      const row = await db.query(
        `SELECT 1 FROM locations.communes WHERE id=$1 AND dataset_version_id=$2
        AND wilaya_id=$3 AND code=$4 AND name_fr=$5 AND name_ar=$6 AND is_active FOR SHARE`,
        [
          destination.id,
          SYNTHETIC_DELIVERY_IDS.dataset,
          SYNTHETIC_DELIVERY_IDS.wilaya,
          destination.code,
          destination.name.fr,
          destination.name.ar,
        ],
      );
      if (row.rowCount !== 1) throw new Error('Synthetic delivery destination conflict');
    }
  });
}
export async function readSyntheticDestinations(
  db: Pool | PoolClient,
): Promise<DeliveryDestination[]> {
  const rows = await db.query<{ id: string; code: string; name_fr: string; name_ar: string }>(
    `SELECT c.id,c.code,c.name_fr,c.name_ar FROM locations.communes c
     JOIN locations.wilayas w ON w.id=c.wilaya_id AND w.dataset_version_id=c.dataset_version_id
     JOIN locations.dataset_versions d ON d.id=c.dataset_version_id
     WHERE c.id=ANY($1::uuid[]) AND c.dataset_version_id=$2 AND c.is_active AND w.is_active
     AND w.id=$3 AND d.source_reference=$4 AND d.source_sha256=$5 AND NOT d.is_active
     ORDER BY c.code FOR SHARE OF c,w,d`,
    [
      SYNTHETIC_DELIVERY_IDS.destinations,
      SYNTHETIC_DELIVERY_IDS.dataset,
      SYNTHETIC_DELIVERY_IDS.wilaya,
      sourceReference,
      sourceHash,
    ],
  );
  return rows.rows.map((row) => {
    const fixture = fixtureDestinations.find((entry) => entry.id === row.id);
    if (
      !fixture ||
      row.code !== fixture.code ||
      row.name_fr !== fixture.name.fr ||
      row.name_ar !== fixture.name.ar
    )
      throw new DeliveryWriteError('DELIVERY_UNAVAILABLE');
    return DeliveryDestinationSchema.parse({
      id: row.id,
      code: row.code,
      datasetVersionId: SYNTHETIC_DELIVERY_IDS.dataset,
      name: { fr: row.name_fr, ar: row.name_ar },
      dataClass: 'synthetic',
    });
  });
}
export async function readSellerDeliveryRates(
  db: Pool | PoolClient,
  sellerId: string,
): Promise<SellerDeliveryRate[]> {
  const destinations = [
    ...(await readSyntheticDestinations(db)),
    ...(await readReferenceDeliveryTargets(db)),
  ];
  const byId = new Map(destinations.map((d) => [d.id, d]));
  const result = await db.query<{
    id: string;
    seller_id: string;
    commune_id: string;
    row_version: number;
    enabled: boolean;
    shipping_fee_minor: number;
    cod_collector: string;
    updated_at: Date;
    use_wilaya_rate: boolean;
  }>(
    `SELECT id,seller_id,commune_id,row_version,enabled,shipping_fee_minor,cod_collector,updated_at,use_wilaya_rate FROM sellers.delivery_rates WHERE seller_id=$1 AND commune_id=ANY($2::uuid[])
     UNION ALL SELECT id,seller_id,wilaya_id,row_version,enabled,shipping_fee_minor,cod_collector,updated_at,false FROM sellers.wilaya_delivery_rates WHERE seller_id=$1 AND wilaya_id=ANY($2::uuid[]) ORDER BY commune_id`,
    [sellerId, destinations.map((d) => d.id)],
  );
  return result.rows.map((row) =>
    SellerDeliveryRateSchema.parse({
      id: row.id,
      sellerId: row.seller_id,
      destination: byId.get(row.commune_id),
      version: row.row_version,
      enabled: row.enabled,
      shippingFeeMinor: row.shipping_fee_minor,
      codCollector: row.cod_collector,
      updatedAt: row.updated_at.toISOString(),
      ...(row.use_wilaya_rate ? { useWilayaRate: true } : {}),
    }),
  );
}
export async function readDeliveryDestinations(db: Pool | PoolClient) {
  return [
    ...(await readSyntheticDestinations(db)),
    ...(await readReferenceDeliveryTargets(db))
      .filter((d) => d.kind === 'COMMUNE')
      .sort(
        (a, b) =>
          (a.wilaya?.code ?? '').localeCompare(b.wilaya?.code ?? '') ||
          a.code.localeCompare(b.code),
      ),
  ];
}
export async function resolveSellerDeliveryRate(
  db: Pool | PoolClient,
  sellerId: string,
  destinationId: string,
) {
  const destination = (await readDeliveryDestinations(db)).find((d) => d.id === destinationId);
  if (!destination) return undefined;
  const rates = await readSellerDeliveryRates(db, sellerId);
  const own = rates.find((r) => r.destination.id === destination.id);
  if (own && !own.useWilayaRate) return own;
  const inherited = rates.find(
    (r) => r.destination.kind === 'WILAYA' && r.destination.id === destination.wilaya?.id,
  );
  return inherited ? { ...inherited, destination } : undefined;
}
export class PostgresDeliveryRepository {
  constructor(
    private readonly pool: Pool,
    private readonly environment: 'local' | 'test' | 'live' | null = null,
  ) {}
  async listDestinations() {
    enabled(this.environment);
    return readDeliveryDestinations(this.pool);
  }
  /** Same resolution as checkout (commune rate, else the wilaya rate) for each seller. */
  async sellerFees(destinationId: string, sellerIds: readonly string[]) {
    enabled(this.environment);
    const id = UuidSchema.parse(destinationId);
    const destination = (await readDeliveryDestinations(this.pool)).find((d) => d.id === id);
    if (!destination) throw new DeliveryWriteError('DELIVERY_UNAVAILABLE');
    return Promise.all(
      sellerIds.map(async (sellerId) => {
        const rate = await resolveSellerDeliveryRate(this.pool, UuidSchema.parse(sellerId), id);
        return rate?.enabled
          ? { sellerId, available: true, shippingFeeMinor: rate.shippingFeeMinor }
          : { sellerId, available: false, shippingFeeMinor: null };
      }),
    );
  }
  async listSellerRates(sellerId: string) {
    enabled(this.environment);
    UuidSchema.parse(sellerId);
    return readSellerDeliveryRates(this.pool, sellerId);
  }
  async setSellerRate(
    sellerId: string,
    actorId: string,
    destinationId: string,
    raw: SetSellerDeliveryRateInput,
    correlationId: string,
  ) {
    enabled(this.environment);
    [sellerId, actorId, destinationId].forEach((value) => UuidSchema.parse(value));
    CorrelationIdSchema.parse(correlationId);
    const input = SetSellerDeliveryRateInputSchema.parse(raw);
    return tx(this.pool, async (db) => {
      // Shared lock order with checkout: seller before rates/offers.
      const seller = await db.query<{ status: string; is_synthetic: boolean }>(
        'SELECT status,is_synthetic FROM sellers.sellers WHERE id=$1 FOR UPDATE',
        [sellerId],
      );
      // Synthetic sellers configure rates only in LOCAL/TEST; live sellers only in live mode.
      if (
        seller.rows[0]?.status !== 'APPROVED' ||
        seller.rows[0].is_synthetic !== (this.environment !== 'live')
      )
        throw new DeliveryWriteError('FORBIDDEN');
      const destinations = [
        ...(await readSyntheticDestinations(db)),
        ...(await readReferenceDeliveryTargets(db)),
      ];
      const destination = destinations.find((d) => d.id === destinationId);
      if (!destination) throw new DeliveryWriteError('DELIVERY_UNAVAILABLE');
      if (input.useWilayaRate && !destination.wilaya)
        throw new DeliveryWriteError('DELIVERY_CONFLICT');
      const wilaya = destination.kind === 'WILAYA';
      const table = wilaya ? 'sellers.wilaya_delivery_rates' : 'sellers.delivery_rates';
      const column = wilaya ? 'wilaya_id' : 'commune_id';
      const previous = (await readSellerDeliveryRates(db, sellerId)).find(
        (r) => r.destination.id === destinationId,
      );
      const same =
        previous &&
        previous.enabled === input.enabled &&
        previous.shippingFeeMinor === input.shippingFeeMinor &&
        previous.codCollector === input.codCollector &&
        Boolean(previous.useWilayaRate) === Boolean(input.useWilayaRate);
      if (previous?.version === input.expectedVersion + 1 && same) return previous;
      if ((previous?.version ?? 0) !== input.expectedVersion)
        throw new DeliveryWriteError('DELIVERY_CONFLICT');
      if (previous) {
        await db.query(
          `UPDATE ${table} SET enabled=$2,shipping_fee_minor=$3,cod_collector=$4,
          ${wilaya ? '' : 'use_wilaya_rate=$5,'}
          row_version=row_version+1,updated_at=date_trunc('milliseconds',clock_timestamp()) WHERE id=$1`,
          [
            previous.id,
            input.enabled,
            input.shippingFeeMinor,
            input.codCollector,
            ...(wilaya ? [] : [input.useWilayaRate ?? false]),
          ],
        );
      } else {
        await db.query(
          `INSERT INTO ${table}(seller_id,${column},enabled,shipping_fee_minor,cod_collector${wilaya ? '' : ',use_wilaya_rate'})
          VALUES($1,$2,$3,$4,$5${wilaya ? '' : ',$6'})`,
          [
            sellerId,
            destinationId,
            input.enabled,
            input.shippingFeeMinor,
            input.codCollector,
            ...(wilaya ? [] : [input.useWilayaRate ?? false]),
          ],
        );
      }
      const saved = (await readSellerDeliveryRates(db, sellerId)).find(
        (r) => r.destination.id === destinationId,
      );
      if (!saved) throw new Error('Saved delivery rate missing');
      const event = EventEnvelopeSchema.parse({
        eventId: randomUUID(),
        eventType: 'seller_delivery.changed',
        eventVersion: 1,
        occurredAt: saved.updatedAt,
        producer: 'atlas-api',
        aggregateType: 'seller_delivery_rate',
        aggregateId: saved.id,
        aggregateVersion: saved.version,
        correlationId,
        causationId: null,
        actor: { type: 'seller_user', id: actorId },
        data: {
          sellerId,
          destinationId,
          rateId: saved.id,
          enabled: saved.enabled,
          dataClass: destination.dataClass,
        },
      });
      await db.query(
        `INSERT INTO platform.audit_events(occurred_at,actor_type,actor_id,scope_snapshot,action,outcome,
        entity_type,entity_id,entity_version,correlation_id,after_data) VALUES($1,'seller_user',$2,$3,
        'seller_delivery.changed','SUCCEEDED','seller_delivery_rate',$4,$5,$6,$7)`,
        [
          event.occurredAt,
          actorId,
          JSON.stringify({ type: 'SELLER', id: sellerId }),
          saved.id,
          saved.version,
          correlationId,
          JSON.stringify(saved),
        ],
      );
      await db.query(
        `INSERT INTO platform.outbox_events(event_id,event_type,event_version,producer,aggregate_type,
        aggregate_id,aggregate_version,payload,actor_type,actor_id,correlation_id,occurred_at)
        VALUES($1,'seller_delivery.changed',1,'atlas-api','seller_delivery_rate',$2,$3,$4,'seller_user',$5,$6,$7)`,
        [
          event.eventId,
          saved.id,
          saved.version,
          JSON.stringify(event.data),
          actorId,
          correlationId,
          event.occurredAt,
        ],
      );
      return saved;
    });
  }
}
