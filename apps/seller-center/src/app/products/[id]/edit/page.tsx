import { randomUUID } from 'node:crypto';
import { UuidSchema } from '@atlas/contracts';
import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { ProductForm } from '@/components/product-forms';
import { Shell } from '@/components/shell';
import { ServiceState } from '@/components/states';
import { getProductSubmission } from '@/lib/api';
import { href, localeFrom, type SearchParams } from '@/lib/i18n';
import { productsCopy } from '@/lib/products-copy';
import { localAccountsEnabled } from '@/lib/security';
import { accessToken } from '@/lib/session';

export default async function EditProduct({
  params,
  searchParams,
}: {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  if (!UuidSchema.safeParse(id).success) notFound();
  const locale = localeFrom((await searchParams).lang);
  const t = productsCopy[locale];
  const token = await accessToken();
  if (!token) redirect(href('/', locale));
  const local = localAccountsEnabled(process.env, (await headers()).get('host'));
  const result = await getProductSubmission(token, id)
    .then((submission) => ({ submission, error: undefined }))
    .catch((error: unknown) => ({ submission: undefined, error }));
  return (
    <Shell locale={locale} currentPath="/products" signedIn local={local}>
      <Link className="back-link" href={href('/products', locale)}>
        {t.back}
      </Link>
      <h1>{t.edit}</h1>
      {result.error ? (
        <ServiceState error={result.error} locale={locale} retryPath={`/products/${id}/edit`} />
      ) : result.submission?.canRevise ? (
        <section className="form-panel">
          <ProductForm
            locale={locale}
            requestId={randomUUID()}
            categories={[result.submission.category]}
            revision={result.submission}
          />
        </section>
      ) : (
        <p className="notice" role="status">
          {t.revisionUnavailable}
        </p>
      )}
    </Shell>
  );
}
