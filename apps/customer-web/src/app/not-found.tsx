import { resolveLocale } from '@/lib/i18n';
import { headers } from 'next/headers';
import { NotFoundState } from '@/components/states';
export default async function NotFound() {
  const locale = resolveLocale((await headers()).get('x-atlas-locale'));
  return (
    <main dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <NotFoundState locale={locale} />
    </main>
  );
}
