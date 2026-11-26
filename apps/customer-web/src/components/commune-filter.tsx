'use client';
import { useEffect, useState } from 'react';
import { contentLocale, type Locale } from '@/lib/i18n';

type Place = {
  id: string;
  name: { fr: string; ar: string };
  wilaya: { id: string; code: string; name: { fr: string; ar: string } } | null;
};
const KEY = 'atlas.commune';
const copy = {
  fr: { label: 'Livré dans ma commune', choose: 'Choisir ma commune', any: 'Toutes les communes', wilaya: 'Wilaya', commune: 'Commune', test: 'Destinations de test', loading: 'Chargement…', error: 'Communes indisponibles.' },
  en: { label: 'Delivered to my commune', choose: 'Choose my commune', any: 'All communes', wilaya: 'Wilaya', commune: 'Commune', test: 'Test destinations', loading: 'Loading…', error: 'Communes unavailable.' },
  ar: { label: 'يُوصَل إلى بلديتي', choose: 'اختر بلديتي', any: 'كل البلديات', wilaya: 'الولاية', commune: 'البلدية', test: 'وجهات تجريبية', loading: 'جارٍ التحميل…', error: 'البلديات غير متاحة.' },
} as const;

const fetchPlaces = (): Promise<Place[]> =>
  fetch('/delivery-destinations')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('places'))))
    .then((data: { items: Place[] }) => data.items);

/**
 * Catalogue filter: keep products a seller delivers to one commune. Communes load on demand
 * (the list is long); the choice is submitted with the filter form as `commune`.
 */
export function CommuneFilter({ value, locale }: { readonly value: string | undefined; readonly locale: Locale }) {
  const t = copy[locale];
  const [places, setPlaces] = useState<Place[] | 'loading' | 'error' | null>(value ? 'loading' : null);
  const [wilaya, setWilaya] = useState('');
  const [commune, setCommune] = useState(value ?? '');

  const apply = (items: Place[], preferred: string) => {
    setPlaces(items);
    const known = items.find((p) => p.id === preferred);
    if (known) {
      setWilaya(known.wilaya?.id ?? 'test');
      setCommune(known.id);
    }
  };
  // A commune in the URL: show its name (and keep it) without a click.
  useEffect(() => {
    if (!value) return;
    let alive = true;
    fetchPlaces()
      .then((items) => alive && apply(items, value))
      .catch(() => alive && setPlaces('error'));
    return () => {
      alive = false;
    };
  }, [value]);
  const open = () => {
    let saved = '';
    try {
      saved = localStorage.getItem(KEY) ?? '';
    } catch {
      saved = '';
    }
    setPlaces('loading');
    fetchPlaces()
      .then((items) => apply(items, saved))
      .catch(() => setPlaces('error'));
  };

  if (places === null || places === 'loading' || places === 'error')
    return (
      <div className="commune-filter">
        <span>{t.label}</span>
        {value ? <input type="hidden" name="commune" value={value} /> : null}
        {places === null ? (
          <button type="button" className="button button--secondary" onClick={open}>
            {t.choose}
          </button>
        ) : (
          <small role="status">{places === 'loading' ? t.loading : t.error}</small>
        )}
      </div>
    );
  const name = (p: { name: { fr: string; ar: string } }) => p.name[contentLocale(locale)];
  const wilayas = [...new Map(places.flatMap((p) => (p.wilaya ? [[p.wilaya.id, p.wilaya] as const] : []))).values()].sort(
    (a, b) => a.code.localeCompare(b.code),
  );
  const visible = places
    .filter((p) => (wilaya === 'test' ? !p.wilaya : p.wilaya?.id === wilaya))
    .sort((a, b) => name(a).localeCompare(name(b)));
  return (
    <fieldset className="commune-filter">
      <legend>{t.label}</legend>
      <label>
        <span className="sr-only">{t.wilaya}</span>
        <select
          aria-label={t.wilaya}
          value={wilaya}
          onChange={(e) => {
            setWilaya(e.target.value);
            setCommune('');
          }}
        >
          <option value="">{t.wilaya}</option>
          {wilayas.map((w) => (
            <option key={w.id} value={w.id}>
              {w.code} — {name(w)}
            </option>
          ))}
          {places.some((p) => !p.wilaya) && <option value="test">{t.test}</option>}
        </select>
      </label>
      <label>
        <span className="sr-only">{t.commune}</span>
        <select
          aria-label={t.commune}
          name="commune"
          value={commune}
          disabled={!wilaya}
          onChange={(e) => {
            setCommune(e.target.value);
            try {
              if (e.target.value) localStorage.setItem(KEY, e.target.value);
            } catch {
              // Remembering the commune is only a convenience.
            }
          }}
        >
          <option value="">{t.any}</option>
          {visible.map((p) => (
            <option key={p.id} value={p.id}>
              {name(p)}
            </option>
          ))}
        </select>
      </label>
    </fieldset>
  );
}
