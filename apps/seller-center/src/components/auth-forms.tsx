'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import {
  forgotPasswordAction,
  resetPasswordAction,
  galleryPhotoAction,
  removePhotoAction,
  reviewSellerAction,
  uploadPhotoAction,
  sellerLoginAction,
  sellerRegisterAction,
  type LoginState,
} from '@/app/auth-actions';
import { authCopy } from '@/lib/auth-copy';
import { copy, href, type Locale } from '@/lib/i18n';

function Field({
  id,
  label,
  hint,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}

export function SellerLoginForm({ locale }: { readonly locale: Locale }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(sellerLoginAction, {
    step: 'password',
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const t = authCopy[locale];
  const needsCode = state.step === 'code' || state.step === 'enroll';
  return (
    <form action={action} className="auth-form">
      <input type="hidden" name="lang" value={locale} />
      <Field id="login-email" label={t.email}>
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="username"
          dir="ltr"
          required
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          readOnly={needsCode}
        />
      </Field>
      <Field id="login-password" label={t.password}>
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          dir="ltr"
          required
          maxLength={128}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          readOnly={needsCode}
        />
      </Field>
      {state.step === 'enroll' && state.secret && (
        <section className="enroll-box" aria-labelledby="enroll-title">
          <h2 id="enroll-title">{t.enrollTitle}</h2>
          <p>{t.enrollBody}</p>
          <p>
            <strong>{t.enrollKey}</strong>
            <br />
            <code dir="ltr" className="enroll-key">
              {state.secret.match(/.{1,4}/g)?.join(' ')}
            </code>
          </p>
          {state.otpauthUri && (
            <p>
              <a href={state.otpauthUri}>{t.enrollLink}</a>
            </p>
          )}
        </section>
      )}
      {needsCode && (
        <Field id="login-code" label={t.code} hint={t.codeHint}>
          <input
            id="login-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            dir="ltr"
            required
            autoFocus
            aria-describedby="login-code-hint"
          />
        </Field>
      )}
      {state.error && (
        <p className="notice error" role="alert">
          {t[state.error]}
        </p>
      )}
      <button className="button full" type="submit" disabled={pending}>
        {pending ? t.busy : needsCode ? t.continue : t.signIn}
      </button>
    </form>
  );
}

export function SellerRegisterForm({ locale }: { readonly locale: Locale }) {
  const [state, action, pending] = useActionState(sellerRegisterAction, {});
  const t = authCopy[locale];
  return (
    <form action={action} className="auth-form">
      <input type="hidden" name="lang" value={locale} />
      <Field id="reg-store" label={t.storeName}>
        <input id="reg-store" name="storeName" required maxLength={160} />
      </Field>
      <Field id="reg-email" label={t.email}>
        <input
          id="reg-email"
          name="email"
          type="email"
          autoComplete="email"
          dir="ltr"
          required
          maxLength={254}
        />
      </Field>
      <Field id="reg-password" label={t.password} hint={t.passwordHint}>
        <input
          id="reg-password"
          name="password"
          type="password"
          autoComplete="new-password"
          dir="ltr"
          required
          minLength={10}
          maxLength={128}
          aria-describedby="reg-password-hint"
        />
      </Field>
      <Field id="reg-fr" label={t.descriptionFr}>
        <textarea id="reg-fr" name="descriptionFr" dir="ltr" lang="fr" required maxLength={8000} />
      </Field>
      <Field id="reg-ar" label={t.descriptionAr}>
        <textarea id="reg-ar" name="descriptionAr" dir="rtl" lang="ar" required maxLength={8000} />
      </Field>
      {state.error && (
        <p className="notice error" role="alert">
          {t[state.error]}
        </p>
      )}
      <button className="button full" type="submit" disabled={pending}>
        {pending ? t.busy : t.becomeSeller}
      </button>
    </form>
  );
}

export function SellerReviewForm({
  locale,
  sellerId,
}: {
  readonly locale: Locale;
  readonly sellerId: string;
}) {
  const [state, action, pending] = useActionState(reviewSellerAction, {});
  const t = authCopy[locale];
  const common = copy[locale];
  return (
    <form action={action} className="auth-form">
      <input type="hidden" name="lang" value={locale} />
      <input type="hidden" name="sellerId" value={sellerId} />
      <Field id={`reason-${sellerId}`} label={t.reason}>
        <input id={`reason-${sellerId}`} name="reason" maxLength={1000} />
      </Field>
      {state.error && (
        <p className="notice error" role="alert">
          {state.error === 'csrf' ? t.csrf : common[state.error]}
        </p>
      )}
      <div className="review-actions">
        <button className="button" type="submit" name="decision" value="APPROVE" disabled={pending}>
          {t.approve}
        </button>
        <button
          className="button secondary"
          type="submit"
          name="decision"
          value="REJECT"
          disabled={pending}
        >
          {t.reject}
        </button>
      </div>
    </form>
  );
}

export function ForgotPasswordForm({ locale }: { readonly locale: Locale }) {
  const [state, action, pending] = useActionState(forgotPasswordAction, {});
  const t = authCopy[locale];
  if (state.done)
    return (
      <p role="status" className="notice success">
        {t.forgotSent}
      </p>
    );
  return (
    <form action={action} className="auth-form">
      <input type="hidden" name="lang" value={locale} />
      <Field id="forgot-email" label={t.email}>
        <input
          id="forgot-email"
          name="email"
          type="email"
          autoComplete="email"
          dir="ltr"
          required
          maxLength={254}
        />
      </Field>
      {state.error && (
        <p className="notice error" role="alert">
          {t[state.error]}
        </p>
      )}
      <button className="button full" type="submit" disabled={pending}>
        {pending ? t.busy : t.forgotSend}
      </button>
    </form>
  );
}

export function ResetPasswordForm({
  locale,
  token,
}: {
  readonly locale: Locale;
  readonly token: string;
}) {
  const [state, action, pending] = useActionState(resetPasswordAction, {});
  const t = authCopy[locale];
  if (state.done)
    return (
      <p role="status" className="notice success">
        {t.resetDone} <Link href={href('/login', locale)}>{t.signIn}</Link>
      </p>
    );
  return (
    <form action={action} className="auth-form">
      <input type="hidden" name="lang" value={locale} />
      <input type="hidden" name="token" value={token} />
      <Field id="reset-password" label={t.password} hint={t.passwordHint}>
        <input
          id="reset-password"
          name="password"
          type="password"
          autoComplete="new-password"
          dir="ltr"
          required
          minLength={10}
          maxLength={128}
          aria-describedby="reset-password-hint"
        />
      </Field>
      {state.error && (
        <p className="notice error" role="alert">
          {t[state.error]}{' '}
          {state.error === 'resetInvalid' && (
            <Link href={href('/forgot-password', locale)}>{t.forgot}</Link>
          )}
        </p>
      )}
      <button className="button full" type="submit" disabled={pending}>
        {pending ? t.busy : t.resetSubmit}
      </button>
    </form>
  );
}

const photoCopy = {
  fr: {
    label: 'Photo du produit (JPEG, PNG ou WebP, 5 Mo max.)',
    submit: 'Envoyer la photo',
    done: 'Photo publiée.',
    invalid: 'Fichier refusé : choisissez une image JPEG, PNG ou WebP de 5 Mo maximum.',
    forbidden: 'Seul le vendeur à l’origine du produit, une fois validé, peut ajouter sa photo.',
    remove: 'Retirer la photo actuelle',
    removed: 'Photo retirée.',
    galleryLabel: 'Photo supplémentaire (JPEG, PNG ou WebP, 5 Mo max.)',
    gallerySubmit: 'Ajouter la photo',
    galleryTitle: 'Photos du produit',
    galleryNote: 'La photo principale, puis jusqu’à 7 photos supplémentaires.',
    cover: 'Photo principale',
    makeCover: 'Mettre en photo principale',
    removeExtra: 'Retirer',
    full: 'Ce produit a déjà 7 photos supplémentaires : retirez-en une d’abord.',
    changed: 'Photos mises à jour.',
  },
  en: {
    label: 'Product photo (JPEG, PNG or WebP, 5 MB max.)',
    submit: 'Upload the photo',
    done: 'Photo published.',
    invalid: 'File refused: choose a JPEG, PNG or WebP image of at most 5 MB.',
    forbidden: 'Only the seller who proposed the product, once approved, can add its photo.',
    remove: 'Remove the current photo',
    removed: 'Photo removed.',
    galleryLabel: 'Extra photo (JPEG, PNG or WebP, 5 MB max.)',
    gallerySubmit: 'Add the photo',
    galleryTitle: 'Product photos',
    galleryNote: 'The main photo, then up to 7 extra photos.',
    cover: 'Main photo',
    makeCover: 'Make main photo',
    removeExtra: 'Remove',
    full: 'This product already has 7 extra photos: remove one first.',
    changed: 'Photos updated.',
  },
  ar: {
    label: 'صورة المنتج (JPEG أو PNG أو WebP، 5 ميغابايت كحد أقصى)',
    submit: 'إرسال الصورة',
    done: 'تم نشر الصورة.',
    invalid: 'الملف مرفوض: اختر صورة JPEG أو PNG أو WebP لا تتجاوز 5 ميغابايت.',
    forbidden: 'يمكن فقط للبائع الذي اقترح المنتج، بعد الموافقة عليه، إضافة صورته.',
    remove: 'إزالة الصورة الحالية',
    removed: 'تمت إزالة الصورة.',
    galleryLabel: 'صورة إضافية (JPEG أو PNG أو WebP، 5 ميغابايت كحد أقصى)',
    gallerySubmit: 'إضافة الصورة',
    galleryTitle: 'صور المنتج',
    galleryNote: 'الصورة الرئيسية، ثم حتى 7 صور إضافية.',
    cover: 'الصورة الرئيسية',
    makeCover: 'جعلها الصورة الرئيسية',
    removeExtra: 'إزالة',
    full: 'لهذا المنتج 7 صور إضافية بالفعل: أزل واحدة أولًا.',
    changed: 'تم تحديث الصور.',
  },
} as const;

export function ProductPhotoForm({
  locale,
  productId,
  gallery = false,
}: {
  readonly locale: Locale;
  readonly productId: string;
  /** Adds an extra photo instead of replacing the main one. */
  readonly gallery?: boolean;
}) {
  const [state, action, pending] = useActionState(uploadPhotoAction, {});
  const t = photoCopy[locale];
  const common = copy[locale];
  const id = `${gallery ? 'gallery' : 'photo'}-${productId}`;
  return (
    <form action={action} className="auth-form">
      <input type="hidden" name="lang" value={locale} />
      <input type="hidden" name="productId" value={productId} />
      {gallery && <input type="hidden" name="target" value="gallery" />}
      <Field id={id} label={gallery ? t.galleryLabel : t.label}>
        <input id={id} name="photo" type="file" accept="image/jpeg,image/png,image/webp" required />
      </Field>
      {state.done && (
        <p role="status" className="notice success">
          {t.done}
        </p>
      )}
      {state.error && (
        <p className="notice error" role="alert">
          {state.error === 'invalid'
            ? t.invalid
            : state.error === 'forbidden'
              ? t.forbidden
              : state.error === 'full'
                ? t.full
                : state.error === 'csrf'
                  ? authCopy[locale].csrf
                  : common[state.error]}
        </p>
      )}
      <button className="button secondary" type="submit" disabled={pending}>
        {pending ? authCopy[locale].busy : gallery ? t.gallerySubmit : t.submit}
      </button>
    </form>
  );
}

export function RemovePhotoButton({
  locale,
  productId,
}: {
  readonly locale: Locale;
  readonly productId: string;
}) {
  const [state, action, pending] = useActionState(removePhotoAction, {});
  const t = photoCopy[locale];
  if (state.done)
    return (
      <p role="status" className="notice success">
        {t.removed}
      </p>
    );
  return (
    <form action={action}>
      <input type="hidden" name="productId" value={productId} />
      {state.error && (
        <p className="notice error" role="alert">
          {t.forbidden}
        </p>
      )}
      <button className="button secondary" type="submit" disabled={pending}>
        {t.remove}
      </button>
    </form>
  );
}

/** Current photos of an approved product: the main one, then extras with their actions. */
export function ProductPhotos({
  locale,
  productId,
  imageUrl,
  gallery,
}: {
  readonly locale: Locale;
  readonly productId: string;
  readonly imageUrl: string | null | undefined;
  readonly gallery: readonly { readonly id: string; readonly url: string }[];
}) {
  const t = photoCopy[locale];
  const cover = imageUrl?.startsWith('/media/') ? imageUrl : null;
  if (cover === null && gallery.length === 0) return null;
  return (
    <section className="photo-strip" aria-label={t.galleryTitle}>
      <h3>{t.galleryTitle}</h3>
      <p className="muted">{t.galleryNote}</p>
      <ul>
        {cover && (
          <li>
            <img src={cover.replace(/\.webp$/, '-640.webp')} alt="" width={120} height={120} />
            <strong>{t.cover}</strong>
          </li>
        )}
        {gallery.map((photo) => (
          <li key={photo.id}>
            <img src={photo.url.replace(/\.webp$/, '-640.webp')} alt="" width={120} height={120} />
            <GalleryPhotoButton locale={locale} productId={productId} mediaId={photo.id} change="cover" />
            <GalleryPhotoButton locale={locale} productId={productId} mediaId={photo.id} change="remove" />
          </li>
        ))}
      </ul>
    </section>
  );
}

function GalleryPhotoButton({
  locale,
  productId,
  mediaId,
  change,
}: {
  readonly locale: Locale;
  readonly productId: string;
  readonly mediaId: string;
  readonly change: 'remove' | 'cover';
}) {
  const [state, action, pending] = useActionState(galleryPhotoAction, {});
  const t = photoCopy[locale];
  if (state.done)
    return (
      <p role="status" className="notice success">
        {t.changed}
      </p>
    );
  return (
    <form action={action}>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="mediaId" value={mediaId} />
      <input type="hidden" name="change" value={change} />
      {state.error && (
        <p className="notice error" role="alert">
          {t.forbidden}
        </p>
      )}
      <button className="button secondary small" type="submit" disabled={pending}>
        {change === 'cover' ? t.makeCover : t.removeExtra}
      </button>
    </form>
  );
}
