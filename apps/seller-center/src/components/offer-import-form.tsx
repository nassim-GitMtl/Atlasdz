'use client';
import { useActionState } from 'react';
import { importOffersAction } from '@/app/actions';
import { copy, lang, type Locale } from '@/lib/i18n';

const reasons = {
  columns: ['Colonnes offer_id, price_dzd et stock introuvables.', 'الأعمدة offer_id وprice_dzd وstock غير موجودة.', 'Columns offer_id, price_dzd and stock not found.'],
  id: ['Identifiant d’offre invalide.', 'معرّف العرض غير صالح.', 'Invalid offer id.'],
  price: ['Prix invalide (ex. 4500.00).', 'سعر غير صالح (مثال 4500.00).', 'Invalid price (e.g. 4500.00).'],
  stock: ['Stock invalide (nombre entier).', 'مخزون غير صالح (عدد صحيح).', 'Invalid stock (whole number).'],
  duplicate: ['Offre déjà présente plus haut.', 'العرض مكرر في سطر سابق.', 'Offer already listed above.'],
  'too-many': ['Plus de 500 lignes : la suite est ignorée.', 'أكثر من 500 سطر: تم تجاهل الباقي.', 'More than 500 lines: the rest is ignored.'],
  unknown: ['Offre introuvable dans votre boutique.', 'العرض غير موجود في متجرك.', 'Offer not found in your shop.'],
  refused: ['Refusé (valeur ou offre modifiée entre-temps).', 'مرفوض (قيمة أو عرض تغيّر).', 'Refused (value, or offer changed meanwhile).'],
  unavailable: ['Service indisponible pour cette ligne.', 'الخدمة غير متاحة لهذا السطر.', 'Service unavailable for this line.'],
} as const;

/** Bulk price/stock update from the offers CSV export, edited in a spreadsheet. */
export function OfferImportForm({ locale }: { readonly locale: Locale }) {
  const [state, action, pending] = useActionState(importOffersAction, {});
  const index = locale === 'fr' ? 0 : locale === 'ar' ? 1 : 2;
  return (
    <section className="holiday-panel" aria-labelledby="import-title">
      <h2 id="import-title">{lang(locale, 'Importer un fichier CSV', 'استيراد ملف CSV', 'Import a CSV file')}</h2>
      <p>
        {lang(
          locale,
          'Exportez vos offres, modifiez les colonnes price_dzd et stock dans un tableur, puis importez le fichier. Les autres colonnes sont ignorées.',
          'صدّر عروضك، عدّل العمودين price_dzd وstock في جدول بيانات، ثم استورد الملف. تُتجاهل الأعمدة الأخرى.',
          'Export your offers, edit the price_dzd and stock columns in a spreadsheet, then import the file. Other columns are ignored.',
        )}{' '}
        <a href="/offers/export" download>
          {lang(locale, 'Télécharger l’export', 'تنزيل الملف', 'Download the export')}
        </a>
      </p>
      <form action={action} className="legal-form">
        <div className="field">
          <label htmlFor="import-file">{lang(locale, 'Fichier CSV', 'ملف CSV', 'CSV file')}</label>
          <input id="import-file" name="file" type="file" accept=".csv,text/csv" required />
        </div>
        {state.error && (
          <p className="notice error" role="alert">
            {state.error === 'file'
              ? lang(locale, 'Choisissez un fichier CSV de 1 Mo au plus.', 'اختر ملف CSV لا يتجاوز 1 ميغابايت.', 'Choose a CSV file of 1 MB at most.')
              : copy[locale][state.error === 'csrf' ? 'csrf' : 'unauthorized']}
          </p>
        )}
        {state.saved !== undefined && (
          <div role="status" className={state.problems?.length ? 'notice' : 'notice success'}>
            <p>
              {lang(
                locale,
                `${state.saved} offre(s) mise(s) à jour, ${state.unchanged ?? 0} inchangée(s).`,
                `تم تحديث ${state.saved} عرض، و${state.unchanged ?? 0} دون تغيير.`,
                `${state.saved} offer(s) updated, ${state.unchanged ?? 0} unchanged.`,
              )}
            </p>
            {state.problems && state.problems.length > 0 && (
              <ul className="import-problems">
                {state.problems.slice(0, 20).map((problem) => (
                  <li key={`${problem.line}-${problem.reason}`}>
                    {lang(locale, 'Ligne', 'السطر', 'Line')} {problem.line} : {reasons[problem.reason][index]}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <button className="button secondary" type="submit" disabled={pending}>
          {pending ? '…' : lang(locale, 'Importer', 'استيراد', 'Import')}
        </button>
      </form>
    </section>
  );
}
