import type { Metadata } from 'next';
import { ResetPasswordForm } from '@/components/auth-forms';
import { Shell } from '@/components/shell';
import { authCopy } from '@/lib/auth-copy';
import { lang, localeFrom, type SearchParams } from '@/lib/i18n';

export const metadata: Metadata = { robots: { index: false }, referrer: 'no-referrer' };

export default async function ResetPassword({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const locale = localeFrom(params.lang);
  const t = authCopy[locale];
  const token = typeof params.token === 'string' ? params.token : '';
  // Invitation links from a seller owner (team members) carry welcome=1.
  const welcome = params.welcome === '1';
  return (
    <Shell locale={locale} currentPath="/reset-password">
      <section className="login-panel">
        <h1>{welcome ? lang(locale, 'Bienvenue dans l’équipe', 'مرحبًا بك في الفريق', 'Welcome to the team') : t.resetTitle}</h1>
        {welcome && (
          <p>
            {lang(
              locale,
              'Choisissez votre mot de passe. À la première connexion, vous activerez la connexion en deux étapes avec une application d’authentification (Google Authenticator, Microsoft Authenticator…).',
              'اختر كلمة المرور. عند أول دخول، ستفعّل التحقق بخطوتين بتطبيق مصادقة (Google Authenticator أو Microsoft Authenticator…).',
              'Choose your password. At your first sign-in you will set up two-step sign-in with an authenticator app (Google Authenticator, Microsoft Authenticator…).',
            )}
          </p>
        )}
        {/^[A-Za-z0-9_-]{43}$/.test(token) ? (
          <ResetPasswordForm locale={locale} token={token} />
        ) : (
          <p role="alert" className="notice error">
            {t.resetInvalid}
          </p>
        )}
      </section>
    </Shell>
  );
}
