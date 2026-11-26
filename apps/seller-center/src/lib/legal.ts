import { SellerLegalSchema, type SellerLegal } from '@atlas/contracts';

export const REGISTER_KINDS = ['COMMERCE', 'ARTISAN', 'AUTO_ENTREPRENEUR'] as const;

export const legalCopy = {
  fr: {
    title: 'Informations légales',
    note: 'Obligatoires (loi 18-05 sur le commerce électronique) : affichées aux clients sur votre boutique.',
    legalName: 'Nom ou raison sociale',
    registerKind: 'Type d’immatriculation',
    COMMERCE: 'Registre du commerce',
    ARTISAN: 'Carte d’artisan',
    AUTO_ENTREPRENEUR: 'Carte d’auto-entrepreneur',
    registerNumber: 'Numéro d’immatriculation',
    taxId: 'NIF (15 à 20 chiffres)',
    address: 'Adresse physique',
    phone: 'Téléphone',
    email: 'E-mail de contact',
    invalid: 'Vérifiez les informations légales : NIF de 15 à 20 chiffres, téléphone de 9 à 15 chiffres, e-mail valide.',
    save: 'Enregistrer',
    saved: 'Informations légales enregistrées.',
    missing: 'Complétez vos informations légales : elles sont obligatoires et affichées aux clients.',
  },
  en: {
    title: 'Legal information',
    note: 'Required (Algerian e-commerce law 18-05): shown to customers on your shop.',
    legalName: 'Name or company name',
    registerKind: 'Registration type',
    COMMERCE: 'Commerce register',
    ARTISAN: 'Craftsman card',
    AUTO_ENTREPRENEUR: 'Auto-entrepreneur card',
    registerNumber: 'Registration number',
    taxId: 'NIF (15 to 20 digits)',
    address: 'Physical address',
    phone: 'Phone',
    email: 'Contact email',
    invalid: 'Check the legal information: NIF of 15 to 20 digits, phone of 9 to 15 digits, valid email.',
    save: 'Save',
    saved: 'Legal information saved.',
    missing: 'Complete your legal information: it is required and shown to customers.',
  },
  ar: {
    title: 'المعلومات القانونية',
    note: 'إلزامية (القانون 18-05 المتعلق بالتجارة الإلكترونية): تُعرض للزبائن في متجرك.',
    legalName: 'الاسم أو التسمية التجارية',
    registerKind: 'نوع القيد',
    COMMERCE: 'السجل التجاري',
    ARTISAN: 'بطاقة الحرفي',
    AUTO_ENTREPRENEUR: 'بطاقة المقاول الذاتي',
    registerNumber: 'رقم القيد',
    taxId: 'رقم التعريف الجبائي (15 إلى 20 رقمًا)',
    address: 'العنوان الفعلي',
    phone: 'الهاتف',
    email: 'البريد الإلكتروني للتواصل',
    invalid: 'تحقق من المعلومات القانونية: رقم جبائي من 15 إلى 20 رقمًا، هاتف من 9 إلى 15 رقمًا، بريد صحيح.',
    save: 'حفظ',
    saved: 'تم حفظ المعلومات القانونية.',
    missing: 'أكمل معلوماتك القانونية: إنها إلزامية وتُعرض للزبائن.',
  },
} as const;

/** The legal identity from form fields (spaces in numbers ignored), or null when invalid. */
export function legalFromForm(form: FormData): SellerLegal | null {
  const text = (key: string) => String(form.get(key) ?? '').trim();
  const digits = (key: string) => text(key).replace(/[\s.-]/g, '');
  const parsed = SellerLegalSchema.safeParse({
    legalName: text('legalName'),
    registerKind: text('registerKind'),
    registerNumber: text('registerNumber'),
    taxId: digits('taxId'),
    address: text('address'),
    phone: digits('phone'),
    email: text('contactEmail'),
  });
  return parsed.success ? parsed.data : null;
}

/** What was typed in the legal fields, to show it again after a refused submission. */
export type LegalDraft = Partial<Record<keyof SellerLegal, string>>;
export function legalDraft(form: FormData): LegalDraft {
  const text = (key: string) => String(form.get(key) ?? '');
  return {
    legalName: text('legalName'),
    registerKind: text('registerKind'),
    registerNumber: text('registerNumber'),
    taxId: text('taxId'),
    address: text('address'),
    phone: text('phone'),
    email: text('contactEmail'),
  };
}
