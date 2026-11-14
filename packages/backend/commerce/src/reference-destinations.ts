import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { DeliveryDestinationSchema, type DeliveryDestination } from '@atlas/contracts';
import { algeriaRegister } from './algeria-register.generated.js';

// Stable application IDs, not claims about new official commune codes.
const id = (value: string) => {
  const hex = createHash('sha256')
    .update(`atlas-location:${algeriaRegister.version}:${value}`)
    .digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};
export const REFERENCE_DELIVERY_DATASET_ID = id('dataset');
const hash = createHash('sha256').update(JSON.stringify(algeriaRegister)).digest('hex');
const reference = algeriaRegister.sources.map((source) => source.url).join(' ');
const sourceName = 'ONS 2021 + JO 26-06 / 26-206; 69 wilayas, 1541 communes';
const wilayas = algeriaRegister.wilayas.map(([code, fr, ar]) => ({
  id: id(`wilaya:${code}`),
  code,
  name: { fr, ar },
}));
const targets: DeliveryDestination[] = [
  ...wilayas.map((w) => ({
    ...w,
    datasetVersionId: REFERENCE_DELIVERY_DATASET_ID,
    dataClass: 'reference' as const,
    kind: 'WILAYA' as const,
  })),
  ...algeriaRegister.communes.map(([code, w, fr, ar]) => {
    const wilaya = wilayas.find((v) => v.code === w);
    if (!wilaya) throw new Error('Reference commune parent missing');
    return {
      id: id(code),
      code,
      name: { fr, ar },
      datasetVersionId: REFERENCE_DELIVERY_DATASET_ID,
      dataClass: 'reference' as const,
      kind: 'COMMUNE' as const,
      wilaya,
    };
  }),
].map((target) => DeliveryDestinationSchema.parse(target));

export async function seedReferenceDeliveryDestinations(pool: Pool, environment: string) {
  // 'live' is passed only by the production composition when ATLAS_LIVE_CHECKOUT=true.
  if (!['local', 'test', 'live'].includes(environment))
    throw new Error('Reference import requires local/test or explicit live checkout');
  const db = await pool.connect();
  let broken = false;
  try {
    await db.query('BEGIN');
    // Inactive reference preview: this does not assert commercial readiness or activate checkout.
    await db.query(
      `INSERT INTO locations.dataset_versions(id,version_code,source_name,source_reference,source_sha256,is_active,notes)
      VALUES($1,$2,$3,$4,$5,false,$6) ON CONFLICT DO NOTHING`,
      [
        REFERENCE_DELIVERY_DATASET_ID,
        algeriaRegister.version,
        sourceName,
        reference,
        hash,
        'Reference geography preview. Commune identities retain ONS 2021 codes; 108 memberships updated under law 26-06. No rates or commercial activation.',
      ],
    );
    const provenance = await db.query(
      `SELECT 1 FROM locations.dataset_versions WHERE id=$1 AND version_code=$2 AND source_name=$3 AND source_reference=$4 AND source_sha256=$5 AND NOT is_active FOR UPDATE`,
      [REFERENCE_DELIVERY_DATASET_ID, algeriaRegister.version, sourceName, reference, hash],
    );
    if (provenance.rowCount !== 1) throw new Error('Reference dataset provenance conflict');
    await db.query(
      `INSERT INTO locations.wilayas(id,dataset_version_id,code,name_fr,name_ar)
      SELECT x.id,$1,x.code,x.fr,x.ar FROM jsonb_to_recordset($2::jsonb) AS x(id uuid,code text,fr text,ar text) ON CONFLICT DO NOTHING`,
      [
        REFERENCE_DELIVERY_DATASET_ID,
        JSON.stringify(
          wilayas.map((w) => ({ id: w.id, code: w.code, fr: w.name.fr, ar: w.name.ar })),
        ),
      ],
    );
    await db.query(
      `INSERT INTO locations.communes(id,dataset_version_id,wilaya_id,code,name_fr,name_ar)
      SELECT x.id,$1,x.wilaya,x.code,x.fr,x.ar FROM jsonb_to_recordset($2::jsonb) AS x(id uuid,wilaya uuid,code text,fr text,ar text) ON CONFLICT DO NOTHING`,
      [
        REFERENCE_DELIVERY_DATASET_ID,
        JSON.stringify(
          targets
            .filter((t) => t.kind === 'COMMUNE')
            .map((t) => {
              if (!t.wilaya) throw new Error('Reference commune parent missing');
              return {
                id: t.id,
                wilaya: t.wilaya.id,
                code: t.code,
                fr: t.name.fr,
                ar: t.name.ar,
              };
            }),
        ),
      ],
    );
    if ((await readReferenceDeliveryTargets(db)).length !== targets.length)
      throw new Error('Incomplete reference geography');
    await db.query('COMMIT');
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

export async function readReferenceDeliveryTargets(
  db: Pool | PoolClient,
): Promise<DeliveryDestination[]> {
  const provenance = await db.query(
    `SELECT source_sha256,source_reference,source_name,version_code,is_active FROM locations.dataset_versions WHERE id=$1 FOR SHARE`,
    [REFERENCE_DELIVERY_DATASET_ID],
  );
  if (!provenance.rows[0]) return [];
  const p = provenance.rows[0];
  if (
    p.source_sha256 !== hash ||
    p.source_reference !== reference ||
    p.source_name !== sourceName ||
    p.version_code !== algeriaRegister.version ||
    p.is_active
  )
    throw new Error('Reference dataset provenance conflict');
  type LocationRow = {
    id: string;
    code: string;
    fr: string;
    ar: string;
    wilaya: string | null;
    is_active: boolean;
  };
  const parentRows = await db.query<LocationRow>(
    `SELECT id,code,name_fr AS fr,name_ar AS ar,NULL::uuid AS wilaya,is_active FROM locations.wilayas WHERE dataset_version_id=$1 ORDER BY id FOR SHARE`,
    [REFERENCE_DELIVERY_DATASET_ID],
  );
  const communeRows = await db.query<LocationRow>(
    `SELECT id,code,name_fr AS fr,name_ar AS ar,wilaya_id AS wilaya,is_active FROM locations.communes WHERE dataset_version_id=$1 ORDER BY id FOR SHARE`,
    [REFERENCE_DELIVERY_DATASET_ID],
  );
  const rows = [...parentRows.rows, ...communeRows.rows];
  const byId = new Map(rows.map((row) => [row.id, row]));
  if (byId.size !== targets.length) throw new Error('Incomplete reference geography');
  for (const target of targets) {
    const row = byId.get(target.id);
    if (
      !row ||
      row.code !== target.code ||
      row.fr !== target.name.fr ||
      row.ar !== target.name.ar ||
      row.wilaya !== (target.wilaya?.id ?? null)
    )
      throw new Error('Reference location identity conflict');
  }
  const active = new Set(rows.filter((row) => row.is_active).map((row) => row.id));
  return targets.filter((t) => active.has(t.id) && (!t.wilaya || active.has(t.wilaya.id)));
}
