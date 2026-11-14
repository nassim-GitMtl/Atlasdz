import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Pool } from 'pg';
import sharp from 'sharp';

export const MEDIA_SERVICE = Symbol('atlas.media');
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type ImageType = { contentType: 'image/jpeg' | 'image/png' | 'image/webp'; ext: string };

/** Identify an image by its magic bytes; the declared Content-Type is never trusted. */
export function detectImage(bytes: Buffer): ImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { contentType: 'image/jpeg', ext: 'jpg' };
  }
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { contentType: 'image/png', ext: 'png' };
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return { contentType: 'image/webp', ext: 'webp' };
  }
  return null;
}

/** A photo (`<uuid>.webp`, max 1600 px) or its small variant (`<uuid>-640.webp`). */
export const MEDIA_FILE_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:-640)?\.(jpg|png|webp)$/;
const SMALL_SUFFIX = '-640';

export const contentTypeFor = (file: string) =>
  file.endsWith('.png') ? 'image/png' : file.endsWith('.webp') ? 'image/webp' : 'image/jpeg';

/** Files stored for a photo URL: `/media/<id>.webp` → the photo and its small variant. */
export function mediaFilesFor(imageUrl: string | null | undefined): string[] {
  const file = /^\/media\/([^/]+)$/.exec(imageUrl ?? '')?.[1];
  if (file === undefined || !MEDIA_FILE_PATTERN.test(file) || file.includes(SMALL_SUFFIX)) {
    return [];
  }
  return [file, file.replace(/\.(\w+)$/, `${SMALL_SUFFIX}.$1`)];
}

/** Small variant name for a photo file, or null when the file already is one. */
export const smallVariantOf = (file: string) =>
  file.includes(SMALL_SUFFIX) ? null : file.replace(/\.(\w+)$/, `${SMALL_SUFFIX}.$1`);

/**
 * Deletes a removed or replaced photo for good (both sizes). Photos are served as stored, never
 * through a cache that would outlive the file, so a takedown is effective immediately.
 */
export async function deleteMediaFiles(
  directory: string,
  imageUrl: string | null | undefined,
): Promise<void> {
  await Promise.all(
    mediaFilesFor(imageUrl).map((file) => rm(join(directory, file), { force: true })),
  );
}

export type NormalizedImage = { large: Buffer; small: Buffer };

/**
 * Re-encodes an upload to WebP in two sizes (1600 px for product pages, 640 px for cards and
 * thumbnails), EXIF orientation applied and all metadata such as GPS location stripped.
 * Returns null for undecodable or oversized (pixel-bomb) images.
 */
export async function normalizeImage(bytes: Buffer): Promise<NormalizedImage | null> {
  try {
    const source = sharp(bytes, { limitInputPixels: 40_000_000, failOn: 'error' }).rotate();
    const [large, small] = await Promise.all([
      source
        .clone()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer(),
      source
        .clone()
        .resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer(),
    ]);
    return { large, small };
  } catch {
    return null;
  }
}

export const WEBP: ImageType = { contentType: 'image/webp', ext: 'webp' };

export type AttachOutcome = 'ATTACHED' | 'NOT_FOUND' | 'SELLER_NOT_APPROVED';

/** Stores product photos on disk and records them; only the submitting seller may upload. */
export class ProductMediaService {
  public constructor(
    private readonly pool: Pool,
    public readonly directory: string,
  ) {}

  /** Only the submitting seller may reset their product to the placeholder image. */
  public async removeOwnPhoto(
    productId: string,
    sellerId: string,
    userId: string,
    correlationId: string,
  ): Promise<boolean> {
    const updated = await this.pool.query<{ previous: string }>(
      `WITH old AS (
         SELECT p.id, p.image_url FROM catalog.products p
         JOIN catalog.product_submissions ps ON ps.product_id = p.id
         WHERE p.id = $1 AND ps.seller_id = $2 AND ps.status = 'APPROVED'
           AND ps.revision_of_submission_id IS NULL AND p.image_url LIKE '/media/%'
         FOR UPDATE OF p)
       UPDATE catalog.products p SET image_url = '/assets/product-placeholder.svg'
       FROM old WHERE p.id = old.id
       RETURNING old.image_url AS previous`,
      [productId, sellerId],
    );
    const previous = updated.rows[0]?.previous;
    if (previous === undefined) return false;
    await this.pool.query(
      `INSERT INTO platform.audit_events
         (actor_type, actor_id, scope_snapshot, action, outcome, entity_type, entity_id,
          correlation_id, before_data)
       VALUES ('seller_user', $1, $2, 'product.photo_removed', 'SUCCEEDED', 'product', $3, $4, $5)`,
      [
        userId,
        JSON.stringify({ type: 'SELLER', id: sellerId }),
        productId,
        correlationId,
        JSON.stringify({ imageUrl: previous }),
      ],
    );
    await deleteMediaFiles(this.directory, previous);
    return true;
  }

  public filePath(file: string): string | null {
    return MEDIA_FILE_PATTERN.test(file) ? join(this.directory, file) : null;
  }

  public async attach(input: {
    productId: string;
    sellerId: string;
    userId: string;
    bytes: Buffer;
    /** The 640 px variant stored next to the photo. */
    smallBytes: Buffer;
    image: ImageType;
    correlationId: string;
  }): Promise<{ outcome: AttachOutcome; imageUrl?: string }> {
    const id = randomUUID();
    const file = `${id}.${input.image.ext}`;
    const stored = [
      { target: join(this.directory, file), bytes: input.bytes },
      { target: join(this.directory, smallVariantOf(file) ?? file), bytes: input.smallBytes },
    ];
    const sha256 = createHash('sha256').update(input.bytes).digest('hex');
    await mkdir(this.directory, { recursive: true });
    for (const entry of stored) {
      await writeFile(`${entry.target}.partial`, entry.bytes, { mode: 0o640 });
    }
    let committed = false;
    const client = await this.pool.connect();
    let broken = false;
    try {
      await client.query('BEGIN');
      const owner = await client.query<{ seller_status: string; previous: string }>(
        `SELECT s.status AS seller_status, p.image_url AS previous
         FROM catalog.product_submissions ps
         JOIN sellers.sellers s ON s.id = ps.seller_id
         JOIN catalog.products p ON p.id = ps.product_id
         WHERE ps.product_id = $1 AND ps.seller_id = $2 AND ps.status = 'APPROVED'
           AND ps.revision_of_submission_id IS NULL
         FOR UPDATE OF p`,
        [input.productId, input.sellerId],
      );
      const row = owner.rows[0];
      if (row === undefined) {
        await client.query('ROLLBACK');
        return { outcome: 'NOT_FOUND' };
      }
      if (row.seller_status !== 'APPROVED') {
        await client.query('ROLLBACK');
        return { outcome: 'SELLER_NOT_APPROVED' };
      }
      await client.query(
        `INSERT INTO catalog.product_media
           (id, product_id, seller_id, uploaded_by, content_type, byte_size, sha256)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          id,
          input.productId,
          input.sellerId,
          input.userId,
          input.image.contentType,
          input.bytes.length,
          sha256,
        ],
      );
      const imageUrl = `/media/${file}`;
      await client.query('UPDATE catalog.products SET image_url = $2 WHERE id = $1', [
        input.productId,
        imageUrl,
      ]);
      await client.query(
        `INSERT INTO platform.audit_events
           (actor_type, actor_id, scope_snapshot, action, outcome, entity_type, entity_id,
            correlation_id, after_data)
         VALUES ('seller_user', $1, $2, 'product.photo_uploaded', 'SUCCEEDED', 'product', $3, $4, $5)`,
        [
          input.userId,
          JSON.stringify({ type: 'SELLER', id: input.sellerId }),
          input.productId,
          input.correlationId,
          JSON.stringify({ mediaId: id, sha256, bytes: input.bytes.length }),
        ],
      );
      // Publish the files before committing so a committed URL always resolves.
      for (const entry of stored) await rename(`${entry.target}.partial`, entry.target);
      await client.query('COMMIT');
      committed = true;
      // The replaced photo is deleted for good (a failure only leaves an unreferenced file).
      await deleteMediaFiles(this.directory, row.previous).catch(() => undefined);
      return { outcome: 'ATTACHED', imageUrl };
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        broken = true;
      }
      throw error;
    } finally {
      client.release(broken);
      if (!committed) {
        for (const entry of stored) {
          await rm(`${entry.target}.partial`, { force: true });
          await rm(entry.target, { force: true });
        }
      }
    }
  }
}
