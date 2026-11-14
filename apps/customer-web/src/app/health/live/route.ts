export function GET() {
  return Response.json(
    { status: 'ok', service: 'atlas-customer-web' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
