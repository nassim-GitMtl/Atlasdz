'use client';
import { useState } from 'react';
import { formatMoney } from '@/lib/catalog-view';
import { contentLocale, type Locale } from '@/lib/i18n';

type Place = {
  id: string;
  name: { fr: string; ar: string };
  wilaya: { id: string; code: string; name: { fr: string; ar: string } } | null;
};
type Fee = { sellerId: string; available: boolean; shippingFeeMinor: number | null };
const KEY = 'atlas.commune';
const copy = {
  fr: {
    open: 'Voir la livraison vers ma commune',
    wilaya: 'Wilaya',
    commune: 'Commune',
    choose: 'Choisir',
    test: 'Destinations de test',
    loading: 'Chargement…',
    error: 'Indisponible pour le moment. Les frais restent affichés au récapitulatif.',
    none: 'Ne livre pas cette commune',
    note: 'Une livraison par vendeur, payée à la réception avec la commande.',
  },
  en: {
    open: 'See delivery to my commune',
    wilaya: 'Wilaya',
    commune: 'Commune',
    choose: 'Choose',
    test: 'Test destinations',
    loading: 'Loading…',
    error: 'Not available right now. Fees still show at review.',
    none: 'Does not deliver to this commune',
    note: 'One delivery per seller, paid on receipt with the order.',
  },
  ar: {
    open: 'عرض التوصيل إلى بلديتي',
    wilaya: 'الولاية',
    commune: 'البلدية',
    choose: 'اختر',
    test: 'وجهات تجريبية',
    loading: 'جارٍ التحميل…',
    error: 'غير متاح حاليًا. تظهر الرسوم في الملخص.',
    none: 'لا يوصل إلى هذه البلدية',
    note: 'توصيل واحد لكل بائع، يُدفع عند الاستلام مع الطلب.',
  },
} as const;

/** Product page: each seller's delivery fee to the shopper's commune, before the cart. */
export function DeliveryEstimate({
  sellers,
  locale,
}: {
  readonly sellers: readonly { readonly id: string; readonly name: string }[];
  readonly locale: Locale;
}) {
  const t = copy[locale];
  const [places, setPlaces] = useState<Place[] | 'loading' | 'error' | null>(null);
  const [wilaya, setWilaya] = useState('');
  const [commune, setCommune] = useState('');
  const [fees, setFees] = useState<Fee[] | 'loading' | 'error' | null>(null);

  const loadFees = (id: string) => {
    setCommune(id);
    if (!id) return setFees(null);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      // Remembering the commune is only a convenience.
    }
    setFees('loading');
    const query = new URLSearchParams({ destinationId: id, sellerIds: sellers.map((s) => s.id).join(',') });
    fetch(`/delivery-fees?${query.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('fees'))))
      .then((data: { items: Fee[] }) => setFees(data.items))
      .catch(() => setFees('error'));
  };
  const open = () => {
    setPlaces('loading');
    fetch('/delivery-destinations')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('places'))))
      .then((data: { items: Place[] }) => {
        setPlaces(data.items);
        let saved = '';
        try {
          saved = localStorage.getItem(KEY) ?? '';
        } catch {
          saved = '';
        }
        const known = data.items.find((p) => p.id === saved);
        if (known) {
          setWilaya(known.wilaya?.id ?? 'test');
          loadFees(known.id);
        }
      })
      .catch(() => setPlaces('error'));
  };

  if (places === null)
    return (
      <button type="button" className="button button--secondary delivery-estimate__open" onClick={open}>
        {t.open}
      </button>
    );
  if (places === 'loading' || places === 'error')
    return <p className="delivery-estimate" role="status">{places === 'loading' ? t.loading : t.error}</p>;
  const wilayas = [...new Map(places.flatMap((p) => (p.wilaya ? [[p.wilaya.id, p.wilaya] as const] : []))).values()].sort(
    (a, b) => a.code.localeCompare(b.code),
  );
  const visible = places
    .filter((p) => (wilaya === 'test' ? !p.wilaya : p.wilaya?.id === wilaya))
    .sort((a, b) => a.name[contentLocale(locale)].localeCompare(b.name[contentLocale(locale)]));
  return (
    <div className="delivery-estimate fee-preview">
      <div className="delivery-estimate__fields">
        <label>
          {t.wilaya}
          <select
            value={wilaya}
            onChange={(e) => {
              setWilaya(e.target.value);
              setCommune('');
              setFees(null);
            }}
          >
            <option value="">{t.choose}</option>
            {wilayas.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} — {w.name[contentLocale(locale)]}
              </option>
            ))}
            {places.some((p) => !p.wilaya) && <option value="test">{t.test}</option>}
          </select>
        </label>
        <label>
          {t.commune}
          <select value={commune} disabled={!wilaya} onChange={(e) => loadFees(e.target.value)}>
            <option value="">{t.choose}</option>
            {visible.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name[contentLocale(locale)]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {fees && (
        <div aria-live="polite">
          {fees === 'loading' || fees === 'error' ? (
            <p>{fees === 'loading' ? t.loading : t.error}</p>
          ) : (
            <ul>
              {sellers.map((seller) => {
                const fee = fees.find((f) => f.sellerId === seller.id);
                return (
                  <li key={seller.id} className={fee?.available ? undefined : 'is-unavailable'}>
                    <span>{seller.name}</span>
                    <strong>
                      {fee?.available && fee.shippingFeeMinor !== null ? (
                        <bdi>{formatMoney(fee.shippingFeeMinor, locale)}</bdi>
                      ) : (
                        t.none
                      )}
                    </strong>
                  </li>
                );
              })}
            </ul>
          )}
          <p>{t.note}</p>
        </div>
      )}
    </div>
  );
}
