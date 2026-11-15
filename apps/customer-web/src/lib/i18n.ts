import type { CatalogProduct } from '@atlas/contracts';

export type Locale = 'fr' | 'ar';
export type SearchParams = Record<string, string | string[] | undefined>;
type LocalizedText = CatalogProduct['title'];

export const locales: readonly Locale[] = ['fr', 'ar'];

export function resolveLocale(value: string | string[] | undefined): Locale {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === 'ar' ? 'ar' : 'fr';
}

export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function text(value: LocalizedText, locale: Locale): string {
  return value[locale];
}

export function localizedHref(
  pathname: string,
  locale: Locale,
  params: Readonly<Record<string, string | undefined>> = {},
): string {
  const query = new URLSearchParams({ lang: locale });
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== 'lang') query.set(key, value);
  }
  return `${pathname}?${query.toString()}`;
}

export function languageSwitchHref(
  pathname: string,
  locale: Locale,
  searchParams: SearchParams,
): string {
  const query = new URLSearchParams();
  for (const [key, rawValue] of Object.entries(searchParams)) {
    if (key === 'lang') continue;
    const values = Array.isArray(rawValue) ? rawValue : rawValue ? [rawValue] : [];
    for (const value of values) query.append(key, value);
  }
  query.set('lang', locale);
  return `${pathname}?${query.toString()}`;
}

export const copy = {
  fr: {
    skip: 'Aller au contenu',
    brandLabel: 'atlas dz — accueil',
    searchLabel: 'Rechercher dans le catalogue',
    searchPlaceholder: 'Qu’est-ce qu’on cherche aujourd’hui ?',
    searchAction: 'Rechercher',
    catalog: 'Catalogue',
    language: 'العربية',
    preview: 'Aperçu local · catalogue synthétique',
    previewDetail: 'Données de démonstration · achats indisponibles.',
    heroKicker: 'La place de marché algérienne',
    heroTitle: ['Cherchez.', 'Comparez.', 'Choisissez.'],
    heroBody:
      'Des offres de vendeurs algériens, avec stock et préparation affichés. Livraison calculée selon votre destination avant confirmation.',
    heroAction: 'Explorer les offres',
    categoryTitle: 'Acheter par catégorie',
    categoryBody: 'Trouvez rapidement le bon rayon.',
    offersTitle: 'Offres du moment',
    offersBody: 'Prix et disponibilité transmis par chaque vendeur.',
    allOffers: 'Voir tout le catalogue',
    deliveryTitle: 'Livraison transparente',
    deliveryBody: 'Un tarif par vendeur et destination, affiché avant confirmation de la commande.',
    sellerTitle: 'Vendeurs identifiables',
    sellerBody: 'Chaque offre indique clairement le vendeur responsable de sa préparation.',
    compareTitle: 'Comparer sans surprise',
    compareBody: 'Prix, stock et livraison restent visibles au même endroit.',
    browseKicker: 'Découvrez et comparez',
    results: 'résultats',
    result: 'résultat',
    resultsFor: 'Résultats pour',
    allProducts: 'Tous les produits',
    filterTitle: 'Affiner',
    allCategories: 'Toutes les catégories',
    availableOnly: 'En stock uniquement',
    sort: 'Trier par',
    recommended: 'Recommandés',
    priceLow: 'Prix croissant',
    priceHigh: 'Prix décroissant',
    fastest: 'Préparation la plus rapide',
    newest: 'Nouveautés',
    previousPage: 'Page précédente',
    nextPage: 'Page suivante',
    pageOf: (page: number, pages: number) => `Page ${page} sur ${pages}`,
    apply: 'Appliquer',
    clear: 'Effacer les filtres',
    from: 'À partir de',
    soldBy: 'Vendu par',
    stock: 'en stock',
    unavailable: 'Indisponible',
    preparation: 'Préparation',
    day: 'jour',
    days: 'jours',
    deliveryFee: 'Frais de livraison',
    shippingAtCheckout: 'Selon destination, au devis',
    free: 'Gratuite',
    viewProduct: 'Voir le produit',
    compareOffers: 'Comparer les offres',
    offer: 'offre',
    offers: 'offres',
    chooseOffer: 'Sélectionner cette offre',
    selectedOffer: 'Offre sélectionnée',
    offerTotal: 'Prix hors livraison',
    viewStore: 'Voir la boutique',
    productDetails: 'Détails du produit',
    sellerStore: 'Boutique vendeur',
    sellerOffers: 'Offres publiées par ce vendeur',
    sellerInfo: 'À propos du vendeur',
    backHome: 'Retour à l’accueil',
    emptyTitle: 'Aucune offre disponible',
    emptyBody: 'Essayez une autre recherche ou revenez bientôt.',
    errorTitle: 'Le catalogue ne répond pas',
    errorBody: 'La connexion est momentanément interrompue. Veuillez réessayer.',
    retry: 'Réessayer',
    notFoundTitle: 'Cette page catalogue est introuvable',
    notFoundBody: 'Le produit ou la boutique a peut-être été retiré.',
    loading: 'Chargement du catalogue',
    footerScope: 'Marketplace multi-vendeur · les vendeurs assurent leurs propres livraisons.',
  },
  ar: {
    skip: 'الانتقال إلى المحتوى',
    brandLabel: 'atlas dz — الصفحة الرئيسية',
    searchLabel: 'البحث في الكتالوج',
    searchPlaceholder: 'ما الذي تبحث عنه اليوم؟',
    searchAction: 'بحث',
    catalog: 'الكتالوج',
    language: 'Français',
    preview: 'معاينة محلية · كتالوج ببيانات تجريبية',
    previewDetail: 'لا يمكن إجراء أي عملية شراء حقيقية في هذه المرحلة.',
    heroKicker: 'السوق الجزائري متعدد البائعين',
    heroTitle: ['ابحث.', 'قارن.', 'اختر.'],
    heroBody:
      'عروض من بائعين جزائريين مع المخزون ومدة التحضير. يُحسب التوصيل حسب الوجهة قبل تأكيد الطلب.',
    heroAction: 'استكشف العروض',
    categoryTitle: 'تسوق حسب الفئة',
    categoryBody: 'انتقل بسرعة إلى القسم المناسب.',
    offersTitle: 'عروض مختارة',
    offersBody: 'السعر والتوفر يحددهما كل بائع.',
    allOffers: 'عرض كل الكتالوج',
    deliveryTitle: 'توصيل واضح',
    deliveryBody: 'تعريفة لكل بائع ووجهة، تظهر قبل تأكيد الطلب.',
    sellerTitle: 'بائعون معروفون',
    sellerBody: 'يبين كل عرض البائع المسؤول عن تحضيره.',
    compareTitle: 'قارن بكل وضوح',
    compareBody: 'السعر والمخزون والتوصيل ظاهرة في مكان واحد.',
    browseKicker: 'اكتشف وقارن',
    results: 'نتائج',
    result: 'نتيجة',
    resultsFor: 'نتائج البحث عن',
    allProducts: 'كل المنتجات',
    filterTitle: 'تصفية',
    allCategories: 'كل الفئات',
    availableOnly: 'المتوفر فقط',
    sort: 'الترتيب حسب',
    recommended: 'المقترحة',
    priceLow: 'السعر من الأقل',
    priceHigh: 'السعر من الأعلى',
    fastest: 'الأسرع تحضيراً',
    newest: 'الأحدث',
    previousPage: 'الصفحة السابقة',
    nextPage: 'الصفحة التالية',
    pageOf: (page: number, pages: number) => `الصفحة ${page} من ${pages}`,
    apply: 'تطبيق',
    clear: 'مسح التصفية',
    from: 'ابتداءً من',
    soldBy: 'يباع من',
    stock: 'متوفر',
    unavailable: 'غير متوفر',
    preparation: 'التحضير',
    day: 'يوم',
    days: 'أيام',
    deliveryFee: 'رسوم التوصيل',
    shippingAtCheckout: 'حسب الوجهة عند مراجعة الطلب',
    free: 'مجاني',
    viewProduct: 'عرض المنتج',
    compareOffers: 'قارن العروض',
    offer: 'عرض',
    offers: 'عروض',
    chooseOffer: 'اختيار هذا العرض',
    selectedOffer: 'العرض المختار',
    offerTotal: 'السعر دون التوصيل',
    viewStore: 'زيارة المتجر',
    productDetails: 'تفاصيل المنتج',
    sellerStore: 'متجر البائع',
    sellerOffers: 'العروض المنشورة من هذا البائع',
    sellerInfo: 'حول البائع',
    backHome: 'العودة إلى الرئيسية',
    emptyTitle: 'لا توجد عروض متاحة',
    emptyBody: 'جرّب بحثاً آخر أو عد قريباً.',
    errorTitle: 'تعذر الاتصال بالكتالوج',
    errorBody: 'انقطع الاتصال مؤقتاً. يرجى المحاولة مجدداً.',
    retry: 'إعادة المحاولة',
    notFoundTitle: 'صفحة الكتالوج غير موجودة',
    notFoundBody: 'ربما تمت إزالة المنتج أو المتجر.',
    loading: 'جارٍ تحميل الكتالوج',
    footerScope: 'سوق متعدد البائعين · كل بائع يتولى توصيل طلباته.',
  },
} as const;
