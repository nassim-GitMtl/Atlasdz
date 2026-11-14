import { SubmitProductInputSchema, ReviewProductInputSchema } from '@atlas/contracts';

export const emptyProductValues = {
  requestId: '',
  revisionOfSubmissionId: '',
  categoryId: '',
  titleFr: '',
  titleAr: '',
  descriptionFr: '',
  descriptionAr: '',
};
export type ProductValues = typeof emptyProductValues;
export function parseProductValues(values: ProductValues) {
  return SubmitProductInputSchema.safeParse({
    requestId: values.requestId,
    ...(values.revisionOfSubmissionId
      ? { revisionOfSubmissionId: values.revisionOfSubmissionId }
      : {}),
    categoryId: values.categoryId,
    title: { fr: values.titleFr, ar: values.titleAr },
    description: { fr: values.descriptionFr, ar: values.descriptionAr },
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
