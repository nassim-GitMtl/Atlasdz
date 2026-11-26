'use client';
import { useActionState } from 'react';
import { logoAction } from '@/app/auth-actions';
import { copy, lang, type Locale } from '@/lib/i18n';

/** Store logo: square image shown on the store page (shop and app). */
export function LogoForm({ locale, logoUrl }: { readonly locale: Locale; readonly logoUrl: string | null | undefined }) {
  const [state, action, pending] = useActionState(logoAction, {});
  const error =
    state.error === 'invalid'
      ? lang(locale, 'Choisissez une image JPEG, PNG ou WebP de 5 Mo au plus.', 'اختر صورة JPEG أو PNG أو WebP لا تتجاوز 5 ميغابايت.', 'Choose a JPEG, PNG or WebP image of 5 MB at most.')
      : state.error === 'forbidden'
        ? lang(locale, 'Disponible une fois la boutique approuvée.', 'متاح بعد قبول المتجر.', 'Available once the shop is approved.')
        : state.error
          ? copy[locale][state.error === 'csrf' ? 'csrf' : state.error === 'unauthorized' ? 'unauthorized' : 'unavailable']
          : null;
  return (
    <section className="holiday-panel" aria-labelledby="logo-title">
      <h2 id="logo-title">{lang(locale, 'Logo de la boutique', 'شعار المتجر', 'Shop logo')}</h2>
      <p>
        {lang(
          locale,
          'Affiché sur la page de votre boutique. Image carrée de préférence ; elle est recadrée au centre.',
          'يظهر في صفحة متجرك. يُفضَّل أن تكون الصورة مربعة؛ تُقصّ من الوسط.',
          'Shown on your shop page. A square image works best; it is cropped to the centre.',
        )}
      </p>
      {logoUrl && (
        <img className="store-logo-preview" src={logoUrl} alt={lang(locale, 'Logo actuel', 'الشعار الحالي', 'Current logo')} width={96} height={96} />
      )}
      <form action={action} className="legal-form">
        <div className="field">
          <label htmlFor="logo-file">{lang(locale, 'Nouvelle image', 'صورة جديدة', 'New image')}</label>
          <input id="logo-file" name="logo" type="file" accept="image/jpeg,image/png,image/webp" required />
        </div>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {state.done && (
          <p className="notice success" role="status">
            {state.done === 'uploaded'
              ? lang(locale, 'Logo enregistré.', 'تم حفظ الشعار.', 'Logo saved.')
              : lang(locale, 'Logo retiré.', 'تمت إزالة الشعار.', 'Logo removed.')}
          </p>
        )}
        <button className="button secondary" type="submit" disabled={pending}>
          {lang(locale, 'Enregistrer le logo', 'حفظ الشعار', 'Save the logo')}
        </button>
      </form>
      {logoUrl && (
        <form action={action}>
          <input type="hidden" name="remove" value="1" />
          <button className="button secondary small" type="submit" disabled={pending}>
            {lang(locale, 'Retirer le logo', 'إزالة الشعار', 'Remove the logo')}
          </button>
        </form>
      )}
    </section>
  );
}
