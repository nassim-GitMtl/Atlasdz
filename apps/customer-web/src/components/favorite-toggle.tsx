'use client';
import { Heart } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import type { Locale } from '@/lib/i18n';

const KEY = 'atlas.favorite-products';
function saved(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 200) : [];
  } catch { return []; }
}
/** Device-only favorites, never sent as customer account data. */
export function FavoriteToggle({ slug, title, locale }: { readonly slug: string; readonly title: string; readonly locale: Locale }) {
  const [active, setActive] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    const sync = () => setActive(saved().includes(slug));
    sync();
    window.addEventListener('storage', sync);
    window.addEventListener('atlas-favorites', sync);
    return () => { window.removeEventListener('storage', sync); window.removeEventListener('atlas-favorites', sync); };
  }, [slug]);
  const label = locale === 'ar' ? `حفظ على هذا الجهاز: ${title}` : `Enregistrer sur cet appareil : ${title}`;
  return <>
    <button type="button" className="favorite-toggle" aria-label={label} aria-pressed={active} title={label} onClick={() => {
      const current = saved();
      const next = current.includes(slug) ? current.filter((item) => item !== slug) : [slug, ...current].slice(0, 200);
      try { localStorage.setItem(KEY, JSON.stringify(next)); setError(false); window.dispatchEvent(new Event('atlas-favorites')); }
      catch { setError(true); }
    }}><Heart size={19} weight={active ? 'fill' : 'regular'} aria-hidden="true" /></button>
    {error && <span className="favorite-error" role="status">{locale === 'ar' ? 'تعذر الحفظ على هذا الجهاز.' : 'Enregistrement indisponible sur cet appareil.'}</span>}
  </>;
}
