'use client';

import { useActionState } from 'react';
import {
  accountAction,
  createCategoryAction,
  moderateReviewAction,
  removePhotoAction,
  sellerStatusAction,
  updateCategoryAction,
  type AdminState,
} from '@/app/admin/actions';
import type { AdminCategory, AdminReview, AdminSeller } from '@/lib/admin';
import { adminCopy } from '@/lib/admin-copy';
import type { Locale } from '@/lib/i18n';

function Feedback({ state, locale }: { readonly state: AdminState; readonly locale: Locale }) {
  const t = adminCopy[locale];
  if (state.done)
    return (
      <p role="status" className="notice success">
        {t.saved}
      </p>
    );
  if (state.error)
    return (
      <p role="alert" className="notice error">
        {t.errors[state.error]}
      </p>
    );
  return null;
}

export function SellerStatusForm({
  seller,
  locale,
}: {
  readonly seller: AdminSeller;
  readonly locale: Locale;
}) {
  const [state, action, pending] = useActionState(sellerStatusAction, {});
  const t = adminCopy[locale];
  const suspend = seller.status === 'APPROVED';
  if (!suspend && seller.status !== 'SUSPENDED') return null;
  return (
    <form action={action} className="auth-form">
      <input type="hidden" name="sellerId" value={seller.sellerId} />
      <input type="hidden" name="status" value={suspend ? 'SUSPENDED' : 'APPROVED'} />
      {suspend && (
        <div className="field">
          <label htmlFor={`reason-${seller.sellerId}`}>{t.reason}</label>
          <input id={`reason-${seller.sellerId}`} name="reason" required maxLength={1000} />
        </div>
      )}
      <Feedback state={state} locale={locale} />
      <button className={suspend ? 'button secondary' : 'button'} type="submit" disabled={pending}>
        {suspend ? t.suspend : t.reinstate}
      </button>
    </form>
  );
}

export function CategoryCreateForm({ locale }: { readonly locale: Locale }) {
  const [state, action, pending] = useActionState(createCategoryAction, {});
  const t = adminCopy[locale];
  return (
    <form action={action} className="auth-form">
      <div className="field">
        <label htmlFor="cat-slug">{t.slug}</label>
        <input
          id="cat-slug"
          name="slug"
          dir="ltr"
          required
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          maxLength={100}
        />
      </div>
      <div className="field">
        <label htmlFor="cat-fr">{t.titleFr}</label>
        <input id="cat-fr" name="titleFr" lang="fr" dir="ltr" required maxLength={160} />
      </div>
      <div className="field">
        <label htmlFor="cat-ar">{t.titleAr}</label>
        <input id="cat-ar" name="titleAr" lang="ar" dir="rtl" required maxLength={160} />
        <label htmlFor="cat-en">{t.titleEn}</label>
        <input id="cat-en" name="titleEn" lang="en" dir="ltr" maxLength={160} />
      </div>
      <Feedback state={state} locale={locale} />
      <button className="button" type="submit" disabled={pending}>
        {t.create}
      </button>
    </form>
  );
}

export function CategoryEditForm({
  category,
  locale,
}: {
  readonly category: AdminCategory;
  readonly locale: Locale;
}) {
  const [state, action, pending] = useActionState(updateCategoryAction, {});
  const t = adminCopy[locale];
  const id = (name: string) => `${name}-${category.id}`;
  return (
    <form action={action} className="admin-row-form">
      <input type="hidden" name="id" value={category.id} />
      <span className="mono">{category.slug}</span>
      <label htmlFor={id('fr')} className="sr-only">
        {t.titleFr}
      </label>
      <input
        id={id('fr')}
        name="titleFr"
        defaultValue={category.title.fr}
        lang="fr"
        dir="ltr"
        required
        maxLength={160}
      />
      <label htmlFor={id('ar')} className="sr-only">
        {t.titleAr}
      </label>
      <input
        id={id('ar')}
        name="titleAr"
        defaultValue={category.title.ar}
        lang="ar"
        dir="rtl"
        required
        maxLength={160}
      />
      <label htmlFor={id('en')} className="sr-only">
        {t.titleEn}
      </label>
      <input
        id={id('en')}
        name="titleEn"
        defaultValue={category.title.en ?? ''}
        lang="en"
        dir="ltr"
        placeholder={t.titleEn}
        maxLength={160}
      />
      <label htmlFor={id('status')} className="sr-only">
        {t.status}
      </label>
      <select id={id('status')} name="status" defaultValue={category.status}>
        <option value="ACTIVE">{t.active}</option>
        <option value="INACTIVE">{t.inactive}</option>
      </select>
      <label htmlFor={id('restriction')} className="sr-only">
        {t.restriction}
      </label>
      <select
        id={id('restriction')}
        name="restrictionClass"
        defaultValue={category.restrictionClass}
      >
        <option value="STANDARD">{t.standard}</option>
        <option value="REVIEW_REQUIRED">{t.reviewRequired}</option>
        <option value="PROHIBITED">{t.prohibited}</option>
      </select>
      <span>{category.products}</span>
      <button className="button secondary" type="submit" disabled={pending}>
        {t.save}
      </button>
      <Feedback state={state} locale={locale} />
    </form>
  );
}

export function RemovePhotoForm({ locale }: { readonly locale: Locale }) {
  const [state, action, pending] = useActionState(removePhotoAction, {});
  const t = adminCopy[locale];
  return (
    <form action={action} className="auth-form">
      <div className="field">
        <label htmlFor="photo-product">{t.photoProduct}</label>
        <input id="photo-product" name="product" dir="ltr" required maxLength={300} />
      </div>
      <Feedback state={state} locale={locale} />
      <button className="button secondary" type="submit" disabled={pending}>
        {t.removePhoto}
      </button>
    </form>
  );
}

export function ReviewModerationForm({
  review,
  locale,
}: {
  readonly review: AdminReview;
  readonly locale: Locale;
}) {
  const [state, action, pending] = useActionState(moderateReviewAction, {});
  const t = adminCopy[locale];
  const hide = review.status === 'PUBLISHED';
  return (
    <form action={action} className="auth-form">
      <input type="hidden" name="reviewId" value={review.id} />
      <input type="hidden" name="version" value={review.version} />
      <input type="hidden" name="action" value={hide ? 'HIDE' : 'PUBLISH'} />
      {hide && (
        <div className="field">
          <label htmlFor={`review-reason-${review.id}`}>{t.reviewReason}</label>
          <input
            id={`review-reason-${review.id}`}
            name="reason"
            required
            minLength={3}
            maxLength={500}
          />
        </div>
      )}
      <Feedback state={state} locale={locale} />
      <button className={hide ? 'button secondary' : 'button'} type="submit" disabled={pending}>
        {hide ? t.hideReview : t.publishReview}
      </button>
    </form>
  );
}

const actionCopy = {
  fr: {
    confirm: 'Je confirme',
    done: 'Fait.',
    conflict: 'Impossible pour le moment : des commandes sont encore en cours, ou l’état a changé.',
    error: 'Action refusée ou service indisponible.',
  },
  en: {
    confirm: 'I confirm',
    done: 'Done.',
    conflict: 'Not possible right now: orders are still in progress, or the state changed.',
    error: 'Action refused or service unavailable.',
  },
  ar: {
    confirm: 'أؤكد',
    done: 'تم.',
    conflict: 'غير ممكن حاليًا: توجد طلبات جارية أو تغيرت الحالة.',
    error: 'رُفض الإجراء أو الخدمة غير متاحة.',
  },
} as const;

/** A staff action on one account or item; destructive ones ask for an explicit confirmation. */
export function AccountActionForm({
  action,
  id,
  label,
  locale,
  danger = false,
  warning,
}: {
  readonly action: string;
  readonly id: string;
  readonly label: string;
  readonly locale: Locale;
  readonly danger?: boolean;
  /** Shown next to the confirmation box for irreversible actions. */
  readonly warning?: string;
}) {
  const [state, run, pending] = useActionState(accountAction, {});
  const t = actionCopy[locale];
  return (
    <form action={run} className={danger ? 'account-action account-action--danger' : 'account-action'}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="action" value={action} />
      {danger ? (
        <label className="account-action__confirm">
          <input type="checkbox" name="confirm" value="yes" required /> {warning ?? t.confirm}
        </label>
      ) : (
        <input type="hidden" name="confirm" value="yes" />
      )}
      <button className={danger ? 'button small danger' : 'button secondary small'} disabled={pending} type="submit">
        {pending ? '…' : label}
      </button>
      {state.done && <span role="status">{t.done}</span>}
      {state.error && (
        <span role="alert" className="account-action__error">
          {state.error === 'conflict' ? t.conflict : t.error}
        </span>
      )}
    </form>
  );
}
