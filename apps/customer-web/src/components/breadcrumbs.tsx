import { CaretRight, House } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';

import { localizedHref, type Locale, lang } from '@/lib/i18n';

interface Crumb {
  readonly href?: string;
  readonly label: string;
}

export function Breadcrumbs({
  locale,
  items,
}: {
  readonly locale: Locale;
  readonly items: Crumb[];
}) {
  return (
    <nav className="breadcrumbs" aria-label={lang(locale, 'Fil d’Ariane', 'مسار التنقل', 'Breadcrumb')}>
      <Link href={localizedHref('/', locale)} aria-label={lang(locale, 'Accueil', 'الرئيسية', 'Home')}>
        <House aria-hidden="true" size={17} weight="fill" />
        <span>atlas dz</span>
      </Link>
      {items.map((item, index) => (
        <span className="breadcrumb-segment" key={`${item.label}-${index}`}>
          <CaretRight aria-hidden="true" size={14} weight="bold" />
          {item.href ? <Link href={item.href}>{item.label}</Link> : <span>{item.label}</span>}
        </span>
      ))}
    </nav>
  );
}
