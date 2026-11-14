import type { Pool, PoolClient } from 'pg';

const id = (value: number): string =>
  `10000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`;
const foundationActorId = '00000000-0000-4000-8000-000000000101';

export const SYNTHETIC_CATALOG_IDS = Object.freeze({
  adminUserId: foundationActorId,
  sellers: Object.freeze([id(1), id(2), id(3), id(4)]),
  categories: Object.freeze([id(101), id(102), id(103), id(104)]),
  products: Object.freeze([id(201), id(202), id(203), id(204), id(205), id(206)]),
  variants: Object.freeze([id(301), id(302), id(303), id(304), id(305), id(306)]),
  offers: Object.freeze([id(401), id(402), id(403), id(404), id(405), id(406)]),
});

const sellers = [
  { id: id(1), slug: 'maison-plus', name: 'Maison Plus' },
  { id: id(2), slug: 'techway', name: 'TechWay' },
  { id: id(3), slug: 'voyage-dz', name: 'Voyage DZ' },
  { id: id(4), slug: 'beaute-algerie', name: 'Beauté d’Algérie' },
] as const;

const categories = [
  { id: id(101), slug: 'kitchen', fr: 'Cuisine', ar: 'المطبخ' },
  { id: id(102), slug: 'phones', fr: 'Téléphones', ar: 'هواتف' },
  { id: id(103), slug: 'fashion', fr: 'Mode', ar: 'الأزياء' },
  { id: id(104), slug: 'beauty', fr: 'Beauté', ar: 'الجمال' },
] as const;

const products = [
  {
    n: 1,
    slug: 'air-fryer-5l',
    fr: 'Friteuse sans huile 5 L',
    ar: 'قلاية هوائية 5 لتر',
    image: 'product-air-fryer.png',
    category: id(101),
    seller: id(1),
    priceMinor: 1250000,
    quantity: 12,
  },
  {
    n: 2,
    slug: 'earbuds-wireless',
    fr: 'Écouteurs sans fil',
    ar: 'سماعات لاسلكية',
    image: 'product-earbuds.png',
    category: id(102),
    seller: id(2),
    priceMinor: 690000,
    quantity: 8,
  },
  {
    n: 3,
    slug: 'suitcase-55',
    fr: 'Valise cabine 55 cm',
    ar: 'حقيبة مقصورة 55 سم',
    image: 'product-suitcase.png',
    category: id(103),
    seller: id(3),
    priceMinor: 980000,
    quantity: 6,
  },
  {
    n: 4,
    slug: 'skincare-set',
    fr: 'Coffret soin visage',
    ar: 'مجموعة العناية بالوجه',
    image: 'product-skincare.png',
    category: id(104),
    seller: id(4),
    priceMinor: 590000,
    quantity: 15,
  },
  {
    n: 5,
    slug: 'smartphone-5g-128',
    fr: 'Smartphone 5G 128 Go',
    ar: 'هاتف 5G بسعة 128 جيجابايت',
    image: 'category-phones.png',
    category: id(102),
    seller: id(2),
    priceMinor: 4890000,
    quantity: 9,
  },
  {
    n: 6,
    slug: 'coffee-maker-compact',
    fr: 'Machine à café compacte',
    ar: 'آلة قهوة مدمجة',
    image: 'category-kitchen.png',
    category: id(101),
    seller: id(1),
    priceMinor: 1120000,
    quantity: 14,
  },
] as const;

async function existsSynthetic(
  client: PoolClient,
  relation: 'sellers.sellers' | 'catalog.categories' | 'catalog.products',
  rowId: string,
  slug: string,
): Promise<boolean> {
  // relation is an internal closed union, never request input.
  const found = await client.query<{ id: string; slug: string; is_synthetic: boolean }>(
    `SELECT id, slug, is_synthetic FROM ${relation} WHERE id = $1 OR slug = $2 FOR UPDATE`,
    [rowId, slug],
  );
  if (found.rows.length === 0) return false;
  if (
    found.rows.length !== 1 ||
    found.rows[0]?.id !== rowId ||
    found.rows[0].slug !== slug ||
    !found.rows[0].is_synthetic
  ) {
    throw new Error(`Synthetic catalog seed conflicts with existing ${relation} data`);
  }
  return true;
}

/** Explicit LOCAL/TEST only; insert missing fixture rows and preserve all existing values. */
export async function seedSyntheticCatalog(pool: Pool, environment: string): Promise<void> {
  if (!['local', 'test'].includes(environment)) {
    throw new Error('Synthetic catalog seed is restricted to LOCAL and TEST environments');
  }
  const client = await pool.connect();
  let broken = false;
  try {
    await client.query('BEGIN');
    // Serialize seed reruns. This is not a production catalog administration path.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('atlas-synthetic-catalog'))");
    const actor = await client.query(
      `
      SELECT u.id FROM identity.users u
      JOIN identity.user_role_assignments a ON a.user_id = u.id
      JOIN identity.roles r ON r.id = a.role_id
      WHERE u.id = $1 AND u.status = 'ACTIVE'
        AND a.id = '00000000-0000-4000-8000-000000000301'
        AND a.actor_type = 'staff' AND a.scope_type = 'GLOBAL'
        AND a.granted_reason = 'Deterministic synthetic foundation seed'
        AND r.id = '00000000-0000-4000-8000-000000000201'
        AND r.code = 'LOCAL_TEST_OPERATOR' AND r.is_system = false
        AND r.description = 'Synthetic local/test role; never a production authorization definition'
      FOR SHARE OF u, a, r
    `,
      [foundationActorId],
    );
    if (actor.rows.length !== 1) {
      throw new Error('Run the verified synthetic foundation seed before the catalog seed');
    }
    for (const seller of sellers) {
      if (await existsSynthetic(client, 'sellers.sellers', seller.id, seller.slug)) continue;
      await client.query(
        `
        INSERT INTO sellers.sellers (id, slug, name, description_fr, description_ar, status, is_synthetic)
        VALUES ($1, $2, $3, 'Vendeur fictif pour les essais locaux. Préparation et livraison par le vendeur.',
          'بائع تجريبي للاختبارات المحلية. يتولى البائع التحضير والتوصيل.', 'APPROVED', true)
      `,
        [seller.id, seller.slug, seller.name],
      );
    }
    for (const category of categories) {
      if (await existsSynthetic(client, 'catalog.categories', category.id, category.slug)) continue;
      await client.query(
        `
        INSERT INTO catalog.categories (id, slug, title_fr, title_ar, status, moderation_status, restriction_class, is_synthetic)
        VALUES ($1, $2, $3, $4, 'ACTIVE', 'APPROVED', 'STANDARD', true)
      `,
        [category.id, category.slug, category.fr, category.ar],
      );
    }
    for (const product of products) {
      const productId = id(200 + product.n);
      const variantId = id(300 + product.n);
      const offerId = id(400 + product.n);
      if (!(await existsSynthetic(client, 'catalog.products', productId, product.slug))) {
        await client.query(
          `
          INSERT INTO catalog.products (id, category_id, slug, title_fr, title_ar, description_fr, description_ar,
            image_url, status, moderation_status, is_synthetic)
          VALUES ($1, $2, $3, $4, $5,
            'Article fictif pour tester le catalogue. Aucune vente réelle. Le vendeur prépare et expédie la commande.',
            'منتج تجريبي لاختبار الكتالوج. لا توجد مبيعات حقيقية. يتولى البائع تجهيز الطلب وشحنه.',
            $6, 'ACTIVE', 'APPROVED', true)
        `,
          [
            productId,
            product.category,
            product.slug,
            product.fr,
            product.ar,
            `/assets/${product.image}`,
          ],
        );
      }
      const sku = `SYNTHETIC-CATALOG-${product.n}`;
      const existingVariant = await client.query<{ id: string; product_id: string; sku: string }>(
        `
        SELECT id, product_id, sku FROM catalog.product_variants
        WHERE id = $1 OR sku = $2 OR (product_id = $3 AND is_default) FOR UPDATE
      `,
        [variantId, sku, productId],
      );
      if (existingVariant.rows.length === 0) {
        await client.query(
          'INSERT INTO catalog.product_variants (id, product_id, sku, is_default) VALUES ($1, $2, $3, true)',
          [variantId, productId, sku],
        );
      } else if (
        existingVariant.rows.length !== 1 ||
        existingVariant.rows[0]?.id !== variantId ||
        existingVariant.rows[0].product_id !== productId ||
        existingVariant.rows[0].sku !== sku
      ) {
        throw new Error('Synthetic catalog seed conflicts with an existing variant');
      }
      const existingOffer = await client.query<{
        id: string;
        seller_id: string;
        product_id: string;
        variant_id: string;
        is_synthetic: boolean;
      }>(
        `
        SELECT id, seller_id, product_id, variant_id, is_synthetic FROM offers.offers
        WHERE id = $1 OR (seller_id = $2 AND variant_id = $3) FOR UPDATE
      `,
        [offerId, product.seller, variantId],
      );
      if (existingOffer.rows.length === 0) {
        await client.query(
          `
          INSERT INTO offers.offers (id, seller_id, product_id, variant_id, price_minor,
            available_quantity, handling_days, delivery_fee_minor, status, approved_at, approved_by, is_synthetic)
          VALUES ($1, $2, $3, $4, $5, $6, 2, 50000, 'APPROVED', clock_timestamp(), $7, true)
        `,
          [
            offerId,
            product.seller,
            productId,
            variantId,
            product.priceMinor,
            product.quantity,
            foundationActorId,
          ],
        );
      } else if (
        existingOffer.rows.length !== 1 ||
        existingOffer.rows[0]?.id !== offerId ||
        existingOffer.rows[0].seller_id !== product.seller ||
        existingOffer.rows[0].product_id !== productId ||
        existingOffer.rows[0].variant_id !== variantId ||
        !existingOffer.rows[0].is_synthetic
      ) {
        throw new Error('Synthetic catalog seed conflicts with an existing offer');
      }
    }
    await client.query('COMMIT');
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
