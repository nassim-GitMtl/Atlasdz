import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(
    'x-atlas-locale',
    request.nextUrl.searchParams.get('lang') === 'ar' ? 'ar' : 'fr',
  );
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = { matcher: ['/((?!api|_next|favicon.ico).*)'] };
