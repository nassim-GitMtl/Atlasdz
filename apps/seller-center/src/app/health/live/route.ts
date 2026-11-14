export function GET() {
  return Response.json(
    { status: 'ok', service: 'atlas-seller-center' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
