import { notFound } from 'next/navigation';
import { SiteChrome } from '@/components/site-chrome';
import { LEGAL_PAGES, legalContent, legalFacts, type LegalPage } from '@/lib/legal-content';
import type { SearchParams } from '@/lib/i18n';

export default async function Legal({
  params,
  searchParams,
}: {
  readonly params: Promise<{ page: string }>;
  readonly searchParams: Promise<SearchParams>;
}) {
  const { page } = await params;
  if (!(LEGAL_PAGES as readonly string[]).includes(page)) notFound();
  const query = await searchParams;
  const locale = query.lang === 'ar' ? 'ar' : 'fr';
  const facts = legalFacts(process.env, locale);
  const content = legalContent(page as LegalPage, locale, facts);
  return (
    <SiteChrome locale={locale} pathname={`/legal/${page}`} searchParams={query}>
      <article className="page-container auth-page legal-page">
        {!facts.reviewed && (
          <p role="note" className="cart-feedback">
            {locale === 'ar'
              ? 'نموذج يجب أن يراجعه محامٍ قبل الإطلاق.'
              : 'Modèle à faire valider par un juriste avant le lancement.'}
          </p>
        )}
        <h1>{content.title}</h1>
        {content.sections.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
        ))}
      </article>
    </SiteChrome>
  );
}
