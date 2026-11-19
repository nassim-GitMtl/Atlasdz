'use client';
import { useActionState } from 'react';
import { quickUpdateOffersAction } from '@/app/actions';
import { copy, lang, type Locale } from '@/lib/i18n';

export interface QuickEditOffer {
  readonly id: string;
  readonly title: string;
  readonly version: number;
  /** Price and stock as shown, in dinars and units. */
  readonly price: string;
  readonly stock: string;
  readonly note?: string | undefined;
}

/** Price and stock of many offers on one screen; only changed rows are saved. */
export function QuickEditForm({
  locale,
  offers,
}: {
  readonly locale: Locale;
  readonly offers: readonly QuickEditOffer[];
}) {
  const [state, action, pending] = useActionState(quickUpdateOffersAction, {});
  const failed = new Map(state.failed?.map((item) => [item.id, item.reason]));
  const reason = (value: 'invalid' | 'conflict' | 'unavailable') =>
    value === 'invalid'
      ? lang(locale, 'Valeur refusée (prix > 0, stock entier, promotion encore valide).', 'قيمة مرفوضة (السعر > 0، كمية صحيحة، التخفيض لا يزال صالحًا).', 'Value refused (price > 0, whole stock, sale still valid).')
      : value === 'conflict'
        ? lang(locale, 'Modifiée ailleurs entre-temps : rechargez la page.', 'عُدّلت في مكان آخر: أعد تحميل الصفحة.', 'Changed elsewhere meanwhile: reload the page.')
        : copy[locale].unavailable;
  return (
    <form action={action} className="quick-edit">
      <input type="hidden" name="lang" value={locale} />
      {state.error && (
        <p className="notice error" role="alert">
          {copy[locale][state.error === 'csrf' ? 'csrf' : 'unauthorized']}
        </p>
      )}
      <div className="quick-edit__table" role="table" aria-label={lang(locale, 'Prix et stock', 'السعر والمخزون', 'Price and stock')}>
        {offers.map((offer) => {
          const problem = failed.get(offer.id);
          return (
            <div className={`quick-edit__row${problem ? ' is-failed' : ''}`} role="row" key={offer.id}>
              <input type="hidden" name="offer" value={offer.id} />
              <input type="hidden" name={`version-${offer.id}`} value={offer.version} />
              <input type="hidden" name={`was-price-${offer.id}`} value={offer.price} />
              <input type="hidden" name={`was-stock-${offer.id}`} value={offer.stock} />
              <div className="quick-edit__product" role="cell">
                <strong>{offer.title}</strong>
                {offer.note && <small>{offer.note}</small>}
                {problem && (
                  <small className="reject-reason" role="alert">
                    {reason(problem)}
                  </small>
                )}
              </div>
              <label role="cell">
                <span>{lang(locale, 'Prix (DA)', 'السعر (دج)', 'Price (DA)')}</span>
                <input
                  name={`price-${offer.id}`}
                  defaultValue={offer.price}
                  inputMode="decimal"
                  required
                  maxLength={14}
                  dir="ltr"
                />
              </label>
              <label role="cell">
                <span>{lang(locale, 'Stock', 'المخزون', 'Stock')}</span>
                <input
                  name={`stock-${offer.id}`}
                  defaultValue={offer.stock}
                  inputMode="numeric"
                  required
                  maxLength={7}
                  dir="ltr"
                />
              </label>
            </div>
          );
        })}
      </div>
      {/* Next to the button: where the seller is after saving a long list. */}
      {state.saved !== undefined && (
        <p className={`notice ${state.failed?.length ? 'error' : 'success'}`} role="status">
          {lang(locale, 'Offres enregistrées : ', 'العروض المحفوظة: ', 'Offers saved: ')}
          {state.saved}
          {state.failed?.length
            ? lang(locale, ` · non enregistrées : ${state.failed.length}`, ` · غير محفوظة: ${state.failed.length}`, ` · not saved: ${state.failed.length}`)
            : ''}
        </p>
      )}
      <button className="button" type="submit" disabled={pending}>
        {pending ? copy[locale].submitting : lang(locale, 'Enregistrer les modifications', 'حفظ التعديلات', 'Save changes')}
      </button>
    </form>
  );
}
