import { ProductWorkspace } from '@/components/product-workspace';
import type { SearchParams } from '@/lib/i18n';
export default function Products({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  return <ProductWorkspace searchParams={searchParams} />;
}
