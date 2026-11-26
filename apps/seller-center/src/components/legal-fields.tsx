import { legalCopy, REGISTER_KINDS, type LegalDraft } from '@/lib/legal';
import type { Locale } from '@/lib/i18n';

/** The seller's legal identity fields (registration and account page). */
export function LegalFields({
  locale,
  prefix,
  values,
}: {
  readonly locale: Locale;
  readonly prefix: string;
  readonly values?: LegalDraft | null | undefined;
}) {
  const t = legalCopy[locale];
  const id = (name: string) => `${prefix}-${name}`;
  return (
    <fieldset className="legal-fields">
      <legend>{t.title}</legend>
      <p className="muted">{t.note}</p>
      <div className="field">
        <label htmlFor={id('legal-name')}>{t.legalName}</label>
        <input id={id('legal-name')} name="legalName" required maxLength={160} defaultValue={values?.legalName} />
      </div>
      <div className="field">
        <label htmlFor={id('register-kind')}>{t.registerKind}</label>
        <select id={id('register-kind')} name="registerKind" required defaultValue={values?.registerKind ?? 'COMMERCE'}>
          {REGISTER_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {t[kind]}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={id('register-number')}>{t.registerNumber}</label>
        <input id={id('register-number')} name="registerNumber" dir="ltr" required maxLength={40} defaultValue={values?.registerNumber} />
      </div>
      <div className="field">
        <label htmlFor={id('tax-id')}>{t.taxId}</label>
        <input id={id('tax-id')} name="taxId" dir="ltr" inputMode="numeric" required maxLength={30} defaultValue={values?.taxId} />
      </div>
      <div className="field">
        <label htmlFor={id('address')}>{t.address}</label>
        <input id={id('address')} name="address" required maxLength={240} defaultValue={values?.address} />
      </div>
      <div className="field">
        <label htmlFor={id('phone')}>{t.phone}</label>
        <input id={id('phone')} name="phone" type="tel" dir="ltr" autoComplete="tel" required maxLength={20} defaultValue={values?.phone} />
      </div>
      <div className="field">
        <label htmlFor={id('contact-email')}>{t.email}</label>
        <input id={id('contact-email')} name="contactEmail" type="email" dir="ltr" required maxLength={254} defaultValue={values?.email} />
      </div>
    </fieldset>
  );
}
