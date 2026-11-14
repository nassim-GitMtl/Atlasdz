import { apiOrigin } from '@/lib/security';

const FILE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:-640)?\.(jpg|png|webp)$/;

/** Streams seller product photos from the internal API (the API is never public). */
export async function GET(_request: Request, context: { params: Promise<{ file: string }> }) {
  const { file } = await context.params;
  if (!FILE.test(file)) return new Response(null, { status: 404 });
  const upstream = await fetch(new URL(`/media/${file}`, apiOrigin(process.env)), {
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  }).catch(() => null);
  if (!upstream?.ok || !upstream.body) return new Response(null, { status: upstream ? 404 : 502 });
  return new Response(upstream.body, {
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
    },
  });
}
