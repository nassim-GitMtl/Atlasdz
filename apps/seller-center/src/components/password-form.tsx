'use client';
import { useActionState } from 'react';
import { changePasswordAction } from '@/app/auth-actions';
import { authCopy } from '@/lib/auth-copy';
import { copy, lang, type Locale } from '@/lib/i18n';

/** Change the password while signed in (current password required). */
export function PasswordForm({ locale }: { readonly locale: Locale }) {
  const [state, action, pending] = useActionState(changePasswordAction, {});
  const message = (error: NonNullable<typeof state.error>) =>
    ({
      wrong: lang(locale, 'Mot de passe actuel incorrect.', 'كلمة المرور الحالية غير صحيحة.', 'Current password is incorrect.'),
      weak: authCopy[locale].weak,
      same: lang(locale, 'Choisissez un mot de passe différent de l’actuel.', 'اختر كلمة مرور مختلفة عن الحالية.', 'Choose a password different from the current one.'),
      mismatch: lang(locale, 'Les deux nouveaux mots de passe ne correspondent pas.', 'كلمتا المرور الجديدتان غير متطابقتين.', 'The two new passwords do not match.'),
      limited: authCopy[locale].limited,
      csrf: copy[locale].csrf,
      unauthorized: copy[locale].unauthorized,
      unavailable: copy[locale].unavailable,
    })[error];
  const field = (id: string, name: string, label: string, autoComplete: string) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={name}
        type="password"
        autoComplete={autoComplete}
        dir="ltr"
        required
        minLength={name === 'current' ? 1 : 10}
        maxLength={128}
      />
    </div>
  );
  return (
    <section className="holiday-panel" aria-labelledby="password-title">
      <h2 id="password-title">{lang(locale, 'Mot de passe', 'كلمة المرور', 'Password')}</h2>
      {state.done ? (
        <p className="notice success" role="status">
          {lang(
            locale,
            'Mot de passe changé. Vos autres appareils ont été déconnectés.',
            'تم تغيير كلمة المرور وتسجيل خروج أجهزتك الأخرى.',
            'Password changed. Your other devices were signed out.',
          )}
        </p>
      ) : (
        <form action={action} className="legal-form">
          <p>
            {lang(
              locale,
              'Changez-le à tout moment. Vos autres appareils seront déconnectés ; la double authentification reste active.',
              'غيّرها في أي وقت. سيتم تسجيل خروج أجهزتك الأخرى؛ ويبقى التحقق بخطوتين مفعّلًا.',
              'Change it at any time. Your other devices will be signed out; two-step verification stays on.',
            )}
          </p>
          {field('password-current', 'current', lang(locale, 'Mot de passe actuel', 'كلمة المرور الحالية', 'Current password'), 'current-password')}
          {field('password-new', 'password', lang(locale, 'Nouveau mot de passe', 'كلمة المرور الجديدة', 'New password'), 'new-password')}
          {field('password-confirm', 'confirm', lang(locale, 'Confirmer le nouveau mot de passe', 'تأكيد كلمة المرور الجديدة', 'Confirm the new password'), 'new-password')}
          {state.error && (
            <p className="notice error" role="alert">
              {message(state.error)}
            </p>
          )}
          <button className="button secondary" type="submit" disabled={pending}>
            {lang(locale, 'Changer le mot de passe', 'تغيير كلمة المرور', 'Change password')}
          </button>
        </form>
      )}
    </section>
  );
}
