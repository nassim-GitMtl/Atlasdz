import {
  PRODUCT_SPEC_KEYS,
  SubmitProductInputSchema,
  ReviewProductInputSchema,
  type ProductSpecKey,
} from '@atlas/contracts';

/** Form field holding one characteristic, e.g. `spec_brand`. */
export const specField = (key: ProductSpecKey) => `spec_${key}` as const;

export const emptyProductValues = {
  requestId: '',
  revisionOfSubmissionId: '',
  categoryId: '',
  titleFr: '',
  titleAr: '',
  descriptionFr: '',
  descriptionAr: '',
  titleEn: '',
  descriptionEn: '',
  ...(Object.fromEntries(PRODUCT_SPEC_KEYS.map((key) => [specField(key), ''])) as Record<
    ReturnType<typeof specField>,
    string
  >),
};
export type ProductValues = typeof emptyProductValues;
export function parseProductValues(values: ProductValues) {
  return SubmitProductInputSchema.safeParse({
    requestId: values.requestId,
    ...(values.revisionOfSubmissionId
      ? { revisionOfSubmissionId: values.revisionOfSubmissionId }
      : {}),
    categoryId: values.categoryId,
    // English is optional: empty fields are left out and English pages show French.
    title: {
      fr: values.titleFr,
      ar: values.titleAr,
      ...(values.titleEn.trim() ? { en: values.titleEn } : {}),
    },
    description: {
      fr: values.descriptionFr,
      ar: values.descriptionAr,
      ...(values.descriptionEn.trim() ? { en: values.descriptionEn } : {}),
    },
    // Empty characteristics are left out: only what the seller states is published.
    specs: PRODUCT_SPEC_KEYS.flatMap((key) => {
      const value = values[specField(key)].trim();
      return value ? [{ key, value }] : [];
    }),
  });
}
export function parseProductReview(form: FormData) {
  const version = String(form.get('version') ?? '');
  return ReviewProductInputSchema.safeParse({
    decision: form.get('decision'),
    expectedVersion: /^\d{1,10}$/.test(version) ? Number(version) : undefined,
    ...(form.get('decision') === 'REJECTED' ? { reason: form.get('reason') } : {}),
  });
}
