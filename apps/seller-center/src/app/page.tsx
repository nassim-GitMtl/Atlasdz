import Link from 'next/link';
import { headers } from 'next/headers';
import { Shell } from '@/components/shell';
import { authCopy } from '@/lib/auth-copy';
import { copy, href, localeFrom, type SearchParams } from '@/lib/i18n';
import { localAccountsEnabled } from '@/lib/security';
import { accessToken } from '@/lib/session';

export default async function Home({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const locale = localeFrom((await searchParams).lang);
  const t = copy[locale];
  const local = localAccountsEnabled(process.env, (await headers()).get('host'));
  const signedIn = Boolean(await accessToken());
  return (
    <Shell locale={locale} currentPath="/" signedIn={signedIn} local={local}>
      <section className="welcome">
        <span className="eyebrow">ATLAS DZ · {t.workspace}</span>
        <h1>{t.loggedOutTitle}</h1>
        <p>{t.loggedOutBody}</p>
        <div className="welcome-actions">
          {signedIn && (
            <Link className="button" href={href('/offers', locale)}>
              {t.offers} <span aria-hidden="true">↗</span>
            </Link>
          )}
          {!signedIn && (
            <>
              <Link className="button" href={href('/login', locale)}>
                {authCopy[locale].signIn}
              </Link>
              <Link className="button secondary" href={href('/register', locale)}>
                {authCopy[locale].becomeSeller}
              </Link>
            </>
          )}
          {local && (
            <Link
              className={signedIn ? 'button secondary' : 'button'}
              href={href('/local-login', locale)}
            >
              {t.localLink}
            </Link>
          )}
        </div>
        <div className="welcome-art" aria-hidden="true">
          <div className="parcel">
            <span>
              atlas<span className="brand-dot">.</span>dz
            </span>
            <div className="parcel-line" />
          </div>
          <span className="art-circle">↗</span>
        </div>
      </section>
    </Shell>
  );
}
