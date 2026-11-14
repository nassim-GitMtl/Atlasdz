import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set('x-atlas-locale', request.nextUrl.searchParams.get('lang') === 'ar' ? 'ar' : 'fr');
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ['/((?!api|_next|assets|favicon.ico).*)'] };
