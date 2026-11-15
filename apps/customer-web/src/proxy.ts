import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  const lang = request.nextUrl.searchParams.get('lang');
  headers.set('x-atlas-locale', lang === 'ar' || lang === 'en' ? lang : 'fr');
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ['/((?!api|_next|assets|favicon.ico).*)'] };
