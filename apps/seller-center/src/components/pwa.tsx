'use client';

import { useEffect, useState } from 'react';

import type { Locale } from '@/lib/i18n';

type InstallPromptEvent = Event & { prompt: () => Promise<void> };

const text = {
  fr: {
    install: 'Installer l’application',
    ios: 'Sur iPhone ou iPad : touchez le bouton Partager, puis « Sur l’écran d’accueil ».',
  },
  ar: {
    install: 'تثبيت التطبيق',
    ios: 'على iPhone أو iPad: اضغط على زر المشاركة ثم «إضافة إلى الشاشة الرئيسية».',
  },
} as const;

/**
 * Registers public/sw.js, which makes Seller Center installable (Android, iPhone, desktop) and shows
 * an offline page. Production builds only, so development reloads are never cached.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch(() => undefined);
  }, []);
  return null;
}

const runsInstalled = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const appleMobile = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

/** "Install the app": the browser prompt on Android/desktop, the Home Screen steps on iPhone. */
export function InstallApp({ locale }: { readonly locale: Locale }) {
  const t = text[locale];
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    if (runsInstalled()) return;
    setIos(appleMobile());
    const capture = (event: Event) => setPrompt(event as InstallPromptEvent);
    const installed = () => setPrompt(null);
    window.addEventListener('beforeinstallprompt', capture);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('beforeinstallprompt', capture);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);

  if (prompt === null && !ios) return null;
  return (
    <div className="install-app">
      <button
        className="button secondary"
        type="button"
        aria-expanded={prompt === null ? hint : undefined}
        onClick={() => {
          if (prompt === null) {
            setHint(!hint);
            return;
          }
          void prompt.prompt().finally(() => setPrompt(null));
        }}
      >
        {t.install}
      </button>
      {hint && <p>{t.ios}</p>}
    </div>
  );
}
