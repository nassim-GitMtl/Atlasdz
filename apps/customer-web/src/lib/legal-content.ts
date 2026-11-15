/**
 * Legal page TEMPLATES describing how the marketplace actually operates. They must be reviewed
 * by Algerian counsel before launch; set ATLAS_LEGAL_REVIEWED=true only after that review.
 * Company facts come from ATLAS_LEGAL_* environment variables.
 */
export type LegalPage = 'mentions-legales' | 'conditions' | 'confidentialite';
export const LEGAL_PAGES: readonly LegalPage[] = [
  'mentions-legales',
  'conditions',
  'confidentialite',
];

export interface LegalFacts {
  readonly name: string;
  readonly address: string;
  readonly rc: string;
  readonly nif: string;
  readonly email: string;
  readonly phone: string;
  readonly host: string;
  readonly reviewed: boolean;
}

const missing = { fr: '[à compléter]', ar: '[يُستكمل]', en: '[to be completed]' } as const;

export function legalFacts(
  env: Readonly<Record<string, string | undefined>>,
  locale: 'fr' | 'ar' | 'en',
): LegalFacts {
  const get = (key: string) => env[key]?.trim() || missing[locale];
  return {
    name: get('ATLAS_LEGAL_NAME'),
    address: get('ATLAS_LEGAL_ADDRESS'),
    rc: get('ATLAS_LEGAL_RC'),
    nif: get('ATLAS_LEGAL_NIF'),
    email: get('ATLAS_LEGAL_EMAIL'),
    phone: get('ATLAS_LEGAL_PHONE'),
    host: get('ATLAS_LEGAL_HOST'),
    reviewed: env['ATLAS_LEGAL_REVIEWED'] === 'true',
  };
}

type Section = { readonly heading: string; readonly paragraphs: readonly string[] };
type Content = { readonly title: string; readonly sections: readonly Section[] };

/** English readers get the French text, which is the binding version (see the page note). */
export function legalContent(page: LegalPage, locale: 'fr' | 'ar' | 'en', f: LegalFacts): Content {
  const fr: Record<LegalPage, Content> = {
    'mentions-legales': {
      title: 'Mentions légales',
      sections: [
        {
          heading: 'Éditeur de la plateforme',
          paragraphs: [
            `${f.name}, ${f.address}.`,
            `Registre du commerce : ${f.rc} — NIF : ${f.nif}.`,
            `Contact : ${f.email} — ${f.phone}.`,
          ],
        },
        { heading: 'Hébergement', paragraphs: [f.host] },
        {
          heading: 'Rôle de la plateforme',
          paragraphs: [
            'Atlas DZ est une place de marché : chaque produit est vendu, préparé et livré par le vendeur indiqué sur la fiche. Atlas DZ ne détient pas de stock et n’encaisse aucun paiement.',
          ],
        },
      ],
    },
    conditions: {
      title: 'Conditions générales d’utilisation et de vente',
      sections: [
        {
          heading: '1. Objet',
          paragraphs: [
            `Les présentes conditions régissent l’utilisation de la plateforme éditée par ${f.name} et les commandes passées auprès des vendeurs qui y sont référencés.`,
          ],
        },
        {
          heading: '2. Vendeurs',
          paragraphs: [
            'Chaque vendeur est vérifié par Atlas DZ avant de pouvoir vendre. Le vendeur est seul responsable de ses produits, de leurs prix, de leur conformité, de la préparation et de la livraison de sa commande.',
          ],
        },
        {
          heading: '3. Commande',
          paragraphs: [
            'Le client confirme son adresse e-mail (et, si demandé, son numéro de mobile) avant de commander. Le récapitulatif présente, pour chaque vendeur, les articles, les frais de livraison vers la commune choisie et le total à payer.',
            'Chaque vendeur accepte ou refuse sa partie de la commande dans le délai affiché. Sans réponse, elle est annulée automatiquement et aucun paiement n’est dû.',
          ],
        },
        {
          heading: '4. Paiement à la livraison',
          paragraphs: [
            'Le paiement s’effectue en espèces à la réception, auprès du vendeur ou de son transporteur. Atlas DZ ne perçoit aucune somme. Le client vérifie le colis avant de payer.',
          ],
        },
        {
          heading: '5. Livraison et réception',
          paragraphs: [
            'Le vendeur indique le transporteur et la référence de suivi. Le client confirme la réception sur la plateforme. Des refus répétés de colis peuvent entraîner la suspension du paiement à la livraison pour le compte.',
          ],
        },
        {
          heading: '6. Réclamations, retours et remboursements',
          paragraphs: [
            'Le client peut ouvrir une demande d’aide ou de retour depuis sa commande. Le vendeur traite la demande conformément à la réglementation applicable ; Atlas DZ peut intervenir en médiation.',
          ],
        },
        {
          heading: '7. Comptes',
          paragraphs: [
            'L’utilisateur garde ses identifiants confidentiels. Atlas DZ peut suspendre un compte ou un vendeur en cas de fraude, de produit interdit ou de manquement grave.',
          ],
        },
        {
          heading: '8. Droit applicable',
          paragraphs: [
            'Les présentes conditions sont soumises au droit algérien, notamment à la loi n° 18-05 relative au commerce électronique.',
          ],
        },
      ],
    },
    confidentialite: {
      title: 'Politique de confidentialité',
      sections: [
        {
          heading: 'Responsable du traitement',
          paragraphs: [`${f.name}, ${f.address} — ${f.email}.`],
        },
        {
          heading: 'Données traitées et finalités',
          paragraphs: [
            'Compte : e-mail, mot de passe (stocké sous forme chiffrée irréversible), langue, numéro de mobile si vous le confirmez.',
            'Commandes : articles, coordonnées de livraison (nom, téléphone, adresse, commune) transmises uniquement aux vendeurs concernés pour livrer.',
            'Sécurité : journaux techniques et d’audit pour prévenir la fraude et protéger les comptes.',
          ],
        },
        {
          heading: 'Durées de conservation',
          paragraphs: [
            'Les données de compte sont conservées tant que le compte est actif. Les commandes sont conservées pendant la durée exigée pour les pièces commerciales. Les sauvegardes sont conservées 14 jours.',
          ],
        },
        {
          heading: 'Vos droits',
          paragraphs: [
            'Conformément à la loi n° 18-07 relative à la protection des personnes physiques dans le traitement des données à caractère personnel, vous pouvez accéder à vos données, les télécharger et supprimer votre compte depuis « Mon compte », ou nous écrire.',
          ],
        },
        {
          heading: 'Sous-traitants et hébergement',
          paragraphs: [
            `Hébergement : ${f.host}. Envoi d’e-mails et de SMS par des prestataires techniques.`,
          ],
        },
        {
          heading: 'Cookies',
          paragraphs: [
            'Un seul cookie technique de session, nécessaire à la connexion. Aucun cookie publicitaire.',
          ],
        },
      ],
    },
  };
  const ar: Record<LegalPage, Content> = {
    'mentions-legales': {
      title: 'الإشعارات القانونية',
      sections: [
        {
          heading: 'ناشر المنصة',
          paragraphs: [
            `${f.name}، ${f.address}.`,
            `السجل التجاري: ${f.rc} — رقم التعريف الجبائي: ${f.nif}.`,
            `الاتصال: ${f.email} — ${f.phone}.`,
          ],
        },
        { heading: 'الاستضافة', paragraphs: [f.host] },
        {
          heading: 'دور المنصة',
          paragraphs: [
            'أطلس دي زد سوق إلكترونية: يبيع كل منتجٍ البائعُ المذكور في صفحته ويحضّره ويوصله. لا تحتفظ أطلس دي زد بمخزون ولا تحصّل أي مبلغ.',
          ],
        },
      ],
    },
    conditions: {
      title: 'الشروط العامة للاستخدام والبيع',
      sections: [
        {
          heading: '1. الموضوع',
          paragraphs: [
            `تنظم هذه الشروط استخدام المنصة التي تنشرها ${f.name} والطلبات المقدمة لدى البائعين المسجلين فيها.`,
          ],
        },
        {
          heading: '2. البائعون',
          paragraphs: [
            'تتحقق أطلس دي زد من كل بائع قبل السماح له بالبيع. البائع وحده مسؤول عن منتجاته وأسعارها ومطابقتها وتحضير طلبه وتوصيله.',
          ],
        },
        {
          heading: '3. الطلب',
          paragraphs: [
            'يؤكد العميل بريده الإلكتروني (ورقم جواله عند الطلب) قبل الطلب. يعرض الملخص لكل بائع المنتجات ورسوم التوصيل إلى البلدية المختارة والمبلغ المستحق.',
            'يقبل كل بائع جزءه من الطلب أو يرفضه في المهلة المعروضة. وإلا يُلغى تلقائيًا دون أي دفع.',
          ],
        },
        {
          heading: '4. الدفع عند الاستلام',
          paragraphs: [
            'يتم الدفع نقدًا عند الاستلام للبائع أو لناقله. لا تحصّل أطلس دي زد أي مبلغ. يتحقق العميل من الطرد قبل الدفع.',
          ],
        },
        {
          heading: '5. التوصيل والاستلام',
          paragraphs: [
            'يحدد البائع الناقل ومرجع التتبع. يؤكد العميل الاستلام على المنصة. قد يؤدي رفض الطرود المتكرر إلى تعليق الدفع عند الاستلام للحساب.',
          ],
        },
        {
          heading: '6. الشكاوى والإرجاع والاسترداد',
          paragraphs: [
            'يمكن للعميل فتح طلب مساعدة أو إرجاع من صفحة طلبه. يعالج البائع الطلب وفق التنظيم المعمول به، ويمكن لأطلس دي زد التدخل وسيطًا.',
          ],
        },
        {
          heading: '7. الحسابات',
          paragraphs: [
            'يحافظ المستخدم على سرية بيانات دخوله. يمكن لأطلس دي زد تعليق حساب أو بائع في حالة الاحتيال أو منتج ممنوع أو إخلال جسيم.',
          ],
        },
        {
          heading: '8. القانون المطبق',
          paragraphs: [
            'تخضع هذه الشروط للقانون الجزائري، لا سيما القانون رقم 18-05 المتعلق بالتجارة الإلكترونية.',
          ],
        },
      ],
    },
    confidentialite: {
      title: 'سياسة الخصوصية',
      sections: [
        { heading: 'المسؤول عن المعالجة', paragraphs: [`${f.name}، ${f.address} — ${f.email}.`] },
        {
          heading: 'البيانات المعالجة وأغراضها',
          paragraphs: [
            'الحساب: البريد الإلكتروني، كلمة المرور (مخزنة بشكل مشفر لا رجعة فيه)، اللغة، رقم الجوال إذا أكدته.',
            'الطلبات: المنتجات وبيانات التوصيل (الاسم، الهاتف، العنوان، البلدية) تُرسل فقط إلى البائعين المعنيين للتوصيل.',
            'الأمان: سجلات تقنية وسجلات تدقيق لمنع الاحتيال وحماية الحسابات.',
          ],
        },
        {
          heading: 'مدة الحفظ',
          paragraphs: [
            'تُحفظ بيانات الحساب ما دام نشطًا. تُحفظ الطلبات طوال المدة المطلوبة للوثائق التجارية. تُحفظ النسخ الاحتياطية 14 يومًا.',
          ],
        },
        {
          heading: 'حقوقك',
          paragraphs: [
            'وفقًا للقانون رقم 18-07 المتعلق بحماية الأشخاص الطبيعيين في مجال معالجة المعطيات ذات الطابع الشخصي، يمكنك الاطلاع على بياناتك وتنزيلها وحذف حسابك من «حسابي» أو مراسلتنا.',
          ],
        },
        {
          heading: 'المتعاقدون من الباطن والاستضافة',
          paragraphs: [
            `الاستضافة: ${f.host}. إرسال البريد الإلكتروني والرسائل القصيرة عبر مزودين تقنيين.`,
          ],
        },
        {
          heading: 'ملفات تعريف الارتباط',
          paragraphs: ['ملف تقني واحد للجلسة، ضروري لتسجيل الدخول. لا ملفات إعلانية.'],
        },
      ],
    },
  };
  return (locale === 'ar' ? ar : fr)[page];
}

export const legalTitles = {
  fr: {
    'mentions-legales': 'Mentions légales',
    conditions: 'Conditions générales',
    confidentialite: 'Confidentialité',
  },
  en: {
    'mentions-legales': 'Legal notice',
    conditions: 'Terms and conditions',
    confidentialite: 'Privacy',
  },
  ar: {
    'mentions-legales': 'الإشعارات القانونية',
    conditions: 'الشروط العامة',
    confidentialite: 'الخصوصية',
  },
} as const;
