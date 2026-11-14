import { headers } from 'next/headers';
import { NotFoundState } from '@/components/states';
export default async function NotFound() {
  const locale = (await headers()).get('x-atlas-locale') === 'ar' ? 'ar' : 'fr';
  return (
    <main dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <NotFoundState locale={locale} />
    </main>
  );
}
