'use client';
import { useActionState } from 'react';
import { submitProductAction, reviewProductAction } from '@/app/product-actions';
import { copy, type Locale, localized } from '@/lib/i18n';
import { productsCopy } from '@/lib/products-copy';
import { emptyProductValues, specField } from '@/lib/product-input';
import { PRODUCT_SPEC_KEYS, PRODUCT_SPEC_LABELS, type ProductSubmission } from '@atlas/contracts';

export function ProductForm({
  locale,
  requestId,
  categories,
  revision,
}: {
  readonly locale: Locale;
  readonly requestId: string;
  readonly categories: readonly ProductSubmission['category'][];
  readonly revision?: ProductSubmission;
}) {
  const [state, action, pending] = useActionState(submitProductAction, {});
  const t = productsCopy[locale];
  const common = copy[locale];
  const values = state.values ?? {
    ...emptyProductValues,
    requestId,
    ...(revision
      ? {
          revisionOfSubmissionId: revision.id,
          categoryId: revision.category.id,
          titleFr: revision.title.fr,
          titleAr: revision.title.ar,
          descriptionFr: revision.description.fr,
          descriptionAr: revision.description.ar,
          ...Object.fromEntries(
            (revision.specs ?? []).map((spec) => [specField(spec.key), spec.value]),
          ),
        }
      : {}),
  };
  return (
    <form action={action} className="offer-form product-form">
      <input type="hidden" name="lang" value={locale} />
      <input type="hidden" name="requestId" value={values.requestId} />
      <input type="hidden" name="revisionOfSubmissionId" value={values.revisionOfSubmissionId} />
      {state.error && (
        <p className="notice error" role="alert">
          {state.error === 'conflict' ? t.conflict : common[state.error]}
        </p>
      )}
      <p className="notice">{t.photo}</p>
      {revision && <p className="notice">{t.revisionBody}</p>}
      <div className="field">
        <label htmlFor="categoryId">{t.category}</label>
        <select id="categoryId" name="categoryId" defaultValue={values.categoryId} required>
          <option value="">{t.choose}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {localized(c.title, locale)}
            </option>
          ))}
        </select>
      </div>
      {(['titleFr', 'titleAr', 'descriptionFr', 'descriptionAr'] as const).map((key) => (
        <div className="field" key={key}>
          <label htmlFor={key}>{t[key]}</label>
          {key.startsWith('title') ? (
            <input
              id={key}
              name={key}
              lang={key.endsWith('Ar') ? 'ar' : 'fr'}
              dir={key.endsWith('Ar') ? 'rtl' : 'ltr'}
              required
              maxLength={500}
              defaultValue={values[key]}
            />
          ) : (
            <textarea
              id={key}
              name={key}
              lang={key.endsWith('Ar') ? 'ar' : 'fr'}
              dir={key.endsWith('Ar') ? 'rtl' : 'ltr'}
              required
              maxLength={8000}
              rows={5}
              defaultValue={values[key]}
            />
          )}
        </div>
      ))}
      <fieldset className="spec-fields">
        <legend>{t.specsTitle}</legend>
        <p className="muted">{t.specsNote}</p>
        {PRODUCT_SPEC_KEYS.map((key) => (
          <div className="field" key={key}>
            <label htmlFor={specField(key)}>{PRODUCT_SPEC_LABELS[key][locale]}</label>
            <input
              id={specField(key)}
              name={specField(key)}
              maxLength={120}
              defaultValue={values[specField(key)]}
            />
          </div>
        ))}
      </fieldset>
      {categories.length === 0 && <p role="status">{t.noCategories}</p>}
      <button className="button" disabled={pending || categories.length === 0}>
        {pending ? common.submitting : t.submit}
      </button>
    </form>
  );
}
export function ProductReviewForm({
  locale,
  submission,
  decision,
}: {
  readonly locale: Locale;
  readonly submission: ProductSubmission;
  readonly decision: 'APPROVED' | 'REJECTED';
}) {
  const [state, action, pending] = useActionState(reviewProductAction, {});
  const t = productsCopy[locale];
  return (
    <form action={action} className="offer-form product-form">
      <input type="hidden" name="lang" value={locale} />
      <input type="hidden" name="id" value={submission.id} />
      <input type="hidden" name="version" value={submission.rowVersion} />
      <input type="hidden" name="decision" value={decision} />
      {state.error && (
        <p className="notice error" role="alert">
          {state.error === 'conflict' ? t.conflict : copy[locale][state.error]}
        </p>
      )}
      {decision === 'REJECTED' && (
        <div className="field">
          <label htmlFor={`reason-${submission.id}`}>{t.reason}</label>
          <textarea
            id={`reason-${submission.id}`}
            name="reason"
            maxLength={1000}
            required
            defaultValue={state.reason ?? ''}
          />
        </div>
      )}
      <button
        className={decision === 'APPROVED' ? 'button' : 'button secondary'}
        disabled={pending}
      >
        {pending ? copy[locale].submitting : decision === 'APPROVED' ? t.approved : t.rejected}
      </button>
    </form>
  );
}
