export const categories = [
  { id: 'phones', image: '/assets/category-phones.png', label: { fr: 'Téléphones', ar: 'هواتف' } },
  { id: 'kitchen', image: '/assets/category-kitchen.png', label: { fr: 'Cuisine', ar: 'المطبخ' } },
  { id: 'home', image: '/assets/category-home.png', label: { fr: 'Maison', ar: 'المنزل' } },
  { id: 'beauty', image: '/assets/category-beauty.png', label: { fr: 'Beauté', ar: 'الجمال' } },
  { id: 'fashion', image: '/assets/category-fashion.png', label: { fr: 'Mode', ar: 'الأزياء' } },
  { id: 'auto', image: '/assets/category-auto.png', label: { fr: 'Auto', ar: 'السيارات' } },
  { id: 'baby', image: '/assets/category-baby.png', label: { fr: 'Bébé', ar: 'الأطفال' } },
];

export const searchTerms = {
  fr: [
    'smartphone 5G',
    'machine à café',
    'climatiseur',
    'friteuse sans huile',
    'écouteurs',
    'valise',
    'soin visage',
  ],
  ar: [
    'هاتف 5G',
    'آلة قهوة',
    'مكيف هواء',
    'قلاية هوائية',
    'سماعات',
    'حقيبة مقصورة',
    'العناية بالوجه',
  ],
};

export const products = [
  {
    id: 'air-fryer-5l',
    image: '/assets/product-air-fryer.png',
    name: { fr: 'Friteuse sans huile 5 L', ar: 'قلاية هوائية 5 لتر' },
    seller: { fr: 'Maison Plus', ar: 'ميزون بلس' },
    price: 12500,
    oldPrice: 15900,
    rating: 4.6,
    reviews: 128,
    stock: 12,
    delivery: { fr: 'Livraison 2 – 4 jours', ar: 'التوصيل خلال 2 – 4 أيام' },
    verified: true,
  },
  {
    id: 'earbuds-wireless',
    image: '/assets/product-earbuds.png',
    name: { fr: 'Écouteurs sans fil', ar: 'سماعات لاسلكية' },
    seller: { fr: 'TechWay', ar: 'تك واي' },
    price: 6900,
    oldPrice: 8900,
    rating: 4.4,
    reviews: 96,
    stock: 8,
    delivery: { fr: 'Livraison 2 – 4 jours', ar: 'التوصيل خلال 2 – 4 أيام' },
    verified: false,
  },
  {
    id: 'suitcase-55',
    image: '/assets/product-suitcase.png',
    name: { fr: 'Valise cabine 55 cm', ar: 'حقيبة مقصورة 55 سم' },
    seller: { fr: 'Voyage DZ', ar: 'سفر ديزاد' },
    price: 9800,
    oldPrice: 13500,
    rating: 4.7,
    reviews: 210,
    stock: 6,
    delivery: { fr: 'Livraison 3 – 6 jours', ar: 'التوصيل خلال 3 – 6 أيام' },
    verified: true,
  },
  {
    id: 'skincare-set',
    image: '/assets/product-skincare.png',
    name: { fr: 'Coffret soin visage', ar: 'مجموعة العناية بالوجه' },
    seller: { fr: 'Beauté d’Algérie', ar: 'جمال الجزائر' },
    price: 5900,
    oldPrice: 8900,
    rating: 4.5,
    reviews: 74,
    stock: 15,
    delivery: { fr: 'Livraison 2 – 4 jours', ar: 'التوصيل خلال 2 – 4 أيام' },
    verified: false,
  },
];

const catalogProductDetails = {
  'air-fryer-5l': {
    slug: 'air-fryer-5l',
    categoryId: 'kitchen',
    sku: 'DEMO-KIT-001',
    description: {
      fr: 'Une friteuse compacte de démonstration pour préparer des portions familiales avec peu d’huile.',
      ar: 'قلاية تجريبية مدمجة لتحضير حصص عائلية بكمية قليلة من الزيت.',
    },
    features: {
      fr: ['Cuve amovible de 5 L', 'Minuteur de 60 minutes', 'Température réglable'],
      ar: ['سلة قابلة للإزالة بسعة 5 لتر', 'مؤقت لمدة 60 دقيقة', 'درجة حرارة قابلة للضبط'],
    },
    specifications: [
      { label: { fr: 'Capacité', ar: 'السعة' }, value: { fr: '5 L', ar: '5 لتر' } },
      { label: { fr: 'Puissance', ar: 'القدرة' }, value: { fr: '1 500 W', ar: '1500 واط' } },
      {
        label: { fr: 'Garantie démo', ar: 'ضمان تجريبي' },
        value: { fr: '12 mois', ar: '12 شهراً' },
      },
    ],
  },
  'earbuds-wireless': {
    slug: 'earbuds-wireless',
    categoryId: 'phones',
    sku: 'DEMO-PHO-002',
    description: {
      fr: 'Des écouteurs de démonstration légers avec boîtier de recharge et commandes tactiles.',
      ar: 'سماعات تجريبية خفيفة مع علبة شحن وأوامر باللمس.',
    },
    features: {
      fr: ['Boîtier de recharge USB-C', 'Commandes tactiles', 'Autonomie annoncée de 24 h'],
      ar: ['علبة شحن USB-C', 'أوامر باللمس', 'استقلالية معلنة تصل إلى 24 ساعة'],
    },
    specifications: [
      {
        label: { fr: 'Connexion', ar: 'الاتصال' },
        value: { fr: 'Bluetooth 5.3', ar: 'بلوتوث 5.3' },
      },
      { label: { fr: 'Couleur', ar: 'اللون' }, value: { fr: 'Sable', ar: 'رملي' } },
      { label: { fr: 'Recharge', ar: 'الشحن' }, value: { fr: 'USB-C', ar: 'USB-C' } },
    ],
  },
  'suitcase-55': {
    slug: 'suitcase-55',
    categoryId: 'fashion',
    sku: 'DEMO-FAS-003',
    description: {
      fr: 'Une valise cabine de démonstration maniable, avec coque rigide et rangement compartimenté.',
      ar: 'حقيبة مقصورة تجريبية سهلة الحركة بهيكل صلب وتقسيم داخلي عملي.',
    },
    features: {
      fr: [
        'Quatre roues multidirectionnelles',
        'Poignée télescopique',
        'Séparateur intérieur zippé',
      ],
      ar: ['أربع عجلات متعددة الاتجاهات', 'مقبض قابل للسحب', 'فاصل داخلي بسحاب'],
    },
    specifications: [
      { label: { fr: 'Hauteur', ar: 'الارتفاع' }, value: { fr: '55 cm', ar: '55 سم' } },
      { label: { fr: 'Matière', ar: 'المادة' }, value: { fr: 'Coque rigide', ar: 'هيكل صلب' } },
      { label: { fr: 'Volume', ar: 'الحجم' }, value: { fr: '36 L', ar: '36 لتر' } },
    ],
  },
  'skincare-set': {
    slug: 'skincare-set',
    categoryId: 'beauty',
    sku: 'DEMO-BEA-004',
    description: {
      fr: 'Un coffret de démonstration en trois étapes pour nettoyer, hydrater et protéger le visage.',
      ar: 'مجموعة تجريبية من ثلاث خطوات لتنظيف الوجه وترطيبه وحمايته.',
    },
    features: {
      fr: ['Routine en trois étapes', 'Textures légères', 'Pochette réutilisable'],
      ar: ['روتين من ثلاث خطوات', 'تركيبات خفيفة', 'حقيبة قابلة لإعادة الاستخدام'],
    },
    specifications: [
      {
        label: { fr: 'Contenu', ar: 'المحتوى' },
        value: { fr: '3 produits démo', ar: '3 منتجات تجريبية' },
      },
      {
        label: { fr: 'Type', ar: 'النوع' },
        value: { fr: 'Tous types de peau', ar: 'جميع أنواع البشرة' },
      },
      { label: { fr: 'Format', ar: 'الحجم' }, value: { fr: 'Coffret', ar: 'مجموعة' } },
    ],
  },
};

const additionalCatalogProducts = [
  {
    id: 'smartphone-5g-128',
    slug: 'smartphone-5g-128',
    categoryId: 'phones',
    sku: 'DEMO-PHO-005',
    image: '/assets/category-phones.png',
    name: { fr: 'Smartphone 5G 128 Go', ar: 'هاتف 5G بسعة 128 جيجابايت' },
    seller: { fr: 'Pixel Démo', ar: 'بكسل تجريبي' },
    price: 48900,
    oldPrice: 52900,
    rating: 4.5,
    reviews: 84,
    stock: 9,
    delivery: { fr: 'Livraison 2 – 4 jours', ar: 'التوصيل خلال 2 – 4 أيام' },
    verified: true,
    description: {
      fr: 'Un smartphone de démonstration 5G avec écran lumineux, double SIM et stockage de 128 Go.',
      ar: 'هاتف تجريبي يدعم 5G بشاشة ساطعة وشريحتي اتصال وسعة تخزين 128 جيجابايت.',
    },
    features: {
      fr: ['Écran 6,5 pouces', 'Double SIM', 'Batterie 5 000 mAh'],
      ar: ['شاشة 6.5 بوصة', 'شريحتي اتصال', 'بطارية 5000 مللي أمبير'],
    },
    specifications: [
      { label: { fr: 'Stockage', ar: 'التخزين' }, value: { fr: '128 Go', ar: '128 جيجابايت' } },
      { label: { fr: 'Réseau', ar: 'الشبكة' }, value: { fr: '5G', ar: '5G' } },
      { label: { fr: 'Couleur', ar: 'اللون' }, value: { fr: 'Bleu minéral', ar: 'أزرق معدني' } },
    ],
  },
  {
    id: 'coffee-maker-compact',
    slug: 'coffee-maker-compact',
    categoryId: 'kitchen',
    sku: 'DEMO-KIT-006',
    image: '/assets/category-kitchen.png',
    name: { fr: 'Machine à café compacte', ar: 'آلة قهوة مدمجة' },
    seller: { fr: 'Cuisine Démo', ar: 'مطبخ تجريبي' },
    price: 11200,
    oldPrice: 12900,
    rating: 4.3,
    reviews: 61,
    stock: 14,
    delivery: { fr: 'Livraison 2 – 5 jours', ar: 'التوصيل خلال 2 – 5 أيام' },
    verified: true,
    description: {
      fr: 'Une machine à café filtre de démonstration, compacte et simple à utiliser au quotidien.',
      ar: 'آلة قهوة تجريبية مدمجة وسهلة الاستخدام اليومي لتحضير القهوة المصفاة.',
    },
    features: {
      fr: ['Verseuse de 1,2 L', 'Arrêt automatique', 'Filtre réutilisable'],
      ar: ['إبريق بسعة 1.2 لتر', 'إيقاف تلقائي', 'مرشح قابل لإعادة الاستخدام'],
    },
    specifications: [
      { label: { fr: 'Capacité', ar: 'السعة' }, value: { fr: '1,2 L', ar: '1.2 لتر' } },
      { label: { fr: 'Puissance', ar: 'القدرة' }, value: { fr: '900 W', ar: '900 واط' } },
      { label: { fr: 'Filtre', ar: 'المرشح' }, value: { fr: 'Permanent', ar: 'دائم' } },
    ],
  },
  {
    id: 'air-conditioner-12000',
    slug: 'air-conditioner-12000',
    categoryId: 'home',
    sku: 'DEMO-HOM-007',
    image: '/assets/category-home.png',
    name: { fr: 'Climatiseur 12 000 BTU', ar: 'مكيف هواء 12000 وحدة' },
    seller: { fr: 'Maison Démo', ar: 'منزل تجريبي' },
    price: 87900,
    oldPrice: 94900,
    rating: 4.4,
    reviews: 47,
    stock: 5,
    delivery: { fr: 'Livraison 3 – 6 jours', ar: 'التوصيل خلال 3 – 6 أيام' },
    verified: true,
    description: {
      fr: 'Un climatiseur de démonstration conçu pour rafraîchir une pièce de taille moyenne.',
      ar: 'مكيف هواء تجريبي مصمم لتبريد غرفة متوسطة الحجم.',
    },
    features: {
      fr: ['Mode nuit', 'Télécommande', 'Minuterie programmable'],
      ar: ['وضع ليلي', 'جهاز تحكم عن بعد', 'مؤقت قابل للبرمجة'],
    },
    specifications: [
      { label: { fr: 'Capacité', ar: 'السعة' }, value: { fr: '12 000 BTU', ar: '12000 وحدة' } },
      { label: { fr: 'Mode', ar: 'الوضع' }, value: { fr: 'Froid', ar: 'تبريد' } },
      {
        label: { fr: 'Installation', ar: 'التركيب' },
        value: { fr: 'Non incluse', ar: 'غير مشمول' },
      },
    ],
  },
  {
    id: 'car-organizer-foldable',
    slug: 'car-organizer-foldable',
    categoryId: 'auto',
    sku: 'DEMO-AUT-008',
    image: '/assets/category-auto.png',
    name: { fr: 'Organisateur auto pliable', ar: 'منظم سيارة قابل للطي' },
    seller: { fr: 'Route Démo', ar: 'طريق تجريبي' },
    price: 3400,
    oldPrice: 4200,
    rating: 4.2,
    reviews: 39,
    stock: 22,
    delivery: { fr: 'Livraison 2 – 4 jours', ar: 'التوصيل خلال 2 – 4 أيام' },
    verified: false,
    description: {
      fr: 'Un rangement de coffre de démonstration avec séparateurs et poignées renforcées.',
      ar: 'منظم صندوق سيارة تجريبي بفواصل ومقابض معززة.',
    },
    features: {
      fr: ['Format pliable', 'Deux compartiments', 'Poignées renforcées'],
      ar: ['تصميم قابل للطي', 'قسمان', 'مقابض معززة'],
    },
    specifications: [
      { label: { fr: 'Largeur', ar: 'العرض' }, value: { fr: '52 cm', ar: '52 سم' } },
      { label: { fr: 'Matière', ar: 'المادة' }, value: { fr: 'Tissu renforcé', ar: 'قماش معزز' } },
    ],
  },
  {
    id: 'baby-changing-bag',
    slug: 'baby-changing-bag',
    categoryId: 'baby',
    sku: 'DEMO-BAB-009',
    image: '/assets/category-baby.png',
    name: { fr: 'Sac à langer compartimenté', ar: 'حقيبة حفاضات مقسمة' },
    seller: { fr: 'Petit Monde Démo', ar: 'عالم صغير تجريبي' },
    price: 6300,
    oldPrice: 7500,
    rating: 4.6,
    reviews: 72,
    stock: 11,
    delivery: { fr: 'Livraison 2 – 4 jours', ar: 'التوصيل خلال 2 – 4 أيام' },
    verified: true,
    description: {
      fr: 'Un sac à langer de démonstration avec poches organisées et tapis pliable.',
      ar: 'حقيبة حفاضات تجريبية بجيوب منظمة وحصيرة قابلة للطي.',
    },
    features: {
      fr: ['Poches isolées', 'Tapis pliable', 'Bretelles réglables'],
      ar: ['جيوب عازلة', 'حصيرة قابلة للطي', 'أحزمة قابلة للضبط'],
    },
    specifications: [
      { label: { fr: 'Volume', ar: 'الحجم' }, value: { fr: '24 L', ar: '24 لتر' } },
      {
        label: { fr: 'Entretien', ar: 'العناية' },
        value: { fr: 'Nettoyage à la main', ar: 'تنظيف يدوي' },
      },
    ],
  },
];

function normalizeCatalogProduct(product) {
  const specifications = product.specifications ?? [];
  return {
    ...product,
    category: product.categoryId,
    gallery: product.gallery ?? [product.image],
    searchTerms: {
      fr: [product.name.fr, product.description.fr],
      ar: [product.name.ar, product.description.ar],
    },
    specs: {
      fr: Object.fromEntries(specifications.map(({ label, value }) => [label.fr, value.fr])),
      ar: Object.fromEntries(specifications.map(({ label, value }) => [label.ar, value.ar])),
    },
    synthetic: true,
  };
}

export const catalogProducts = [
  ...products.map((product) => ({
    ...product,
    ...catalogProductDetails[product.id],
  })),
  ...additionalCatalogProducts,
].map(normalizeCatalogProduct);

// Keep the original export as the primary catalog for connected routes. The
// first four entries retain their original order so the homepage is unchanged.
products.splice(0, products.length, ...catalogProducts);

export const homeCollections = [
  {
    id: 'living',
    image: '/assets/home-living-room.png',
    label: { fr: 'Salon apaisant', ar: 'غرفة معيشة هادئة' },
  },
  {
    id: 'dining',
    image: '/assets/home-dining-room.png',
    label: { fr: 'Coin repas', ar: 'ركن الطعام' },
  },
  {
    id: 'bedroom',
    image: '/assets/home-bedroom.png',
    label: { fr: 'Chambre douce', ar: 'غرفة نوم مريحة' },
  },
  {
    id: 'console',
    image: '/assets/home-console.png',
    label: { fr: 'Rangements utiles', ar: 'تخزين عملي' },
  },
];

export const wilayas = [
  {
    id: '16',
    name: { fr: 'Alger', ar: 'الجزائر' },
    communes: {
      fr: ['Alger Centre', 'Bab Ezzouar', 'Hydra'],
      ar: ['الجزائر الوسطى', 'باب الزوار', 'حيدرة'],
    },
  },
  {
    id: '31',
    name: { fr: 'Oran', ar: 'وهران' },
    communes: {
      fr: ['Oran Centre', 'Es Sénia', 'Bir El Djir'],
      ar: ['وسط وهران', 'السانية', 'بئر الجير'],
    },
  },
  {
    id: '25',
    name: { fr: 'Constantine', ar: 'قسنطينة' },
    communes: {
      fr: ['Constantine', 'El Khroub', 'Aïn Smara'],
      ar: ['قسنطينة', 'الخروب', 'عين سمارة'],
    },
  },
];

export const prototypeDataNotice = {
  fr: 'Données fictives réservées à la démonstration — aucune commande réelle ne sera créée.',
  ar: 'بيانات خيالية مخصصة للعرض فقط — لن يتم إنشاء أي طلب حقيقي.',
};

export const productOffers = {
  'air-fryer-5l': [
    {
      id: 'offer-air-fryer-maison-plus',
      sellerId: 'maison-plus-demo',
      seller: { fr: 'Maison Plus', ar: 'ميزون بلس' },
      price: 12500,
      oldPrice: 15900,
      stock: 12,
      sellerRating: 4.8,
      sellerReviews: 342,
      verified: true,
      shippingFee: 450,
      delivery: { fr: 'Livraison 2 – 4 jours', ar: 'التوصيل خلال 2 – 4 أيام' },
      synthetic: true,
    },
    {
      id: 'offer-air-fryer-electro-demo',
      sellerId: 'electro-demo',
      seller: { fr: 'Électro Démo', ar: 'إلكترو تجريبي' },
      price: 12900,
      oldPrice: 15400,
      stock: 7,
      sellerRating: 4.5,
      sellerReviews: 118,
      verified: true,
      shippingFee: 350,
      delivery: { fr: 'Livraison 3 – 5 jours', ar: 'التوصيل خلال 3 – 5 أيام' },
      synthetic: true,
    },
  ],
  'earbuds-wireless': [
    {
      id: 'offer-earbuds-techway',
      sellerId: 'techway-demo',
      seller: { fr: 'TechWay', ar: 'تك واي' },
      price: 6900,
      oldPrice: 8900,
      stock: 8,
      sellerRating: 4.4,
      sellerReviews: 205,
      verified: false,
      shippingFee: 600,
      delivery: { fr: 'Livraison 2 – 4 jours', ar: 'التوصيل خلال 2 – 4 أيام' },
      synthetic: true,
    },
    {
      id: 'offer-earbuds-pixel-demo',
      sellerId: 'pixel-demo',
      seller: { fr: 'Pixel Démo', ar: 'بكسل تجريبي' },
      price: 7200,
      oldPrice: 8700,
      stock: 16,
      sellerRating: 4.7,
      sellerReviews: 287,
      verified: true,
      shippingFee: 450,
      delivery: { fr: 'Livraison 3 – 5 jours', ar: 'التوصيل خلال 3 – 5 أيام' },
      synthetic: true,
    },
  ],
  'suitcase-55': [
    {
      id: 'offer-suitcase-voyage-dz',
      sellerId: 'voyage-dz-demo',
      seller: { fr: 'Voyage DZ', ar: 'سفر ديزاد' },
      price: 9800,
      oldPrice: 13500,
      stock: 6,
      sellerRating: 4.7,
      sellerReviews: 190,
      verified: true,
      shippingFee: 650,
      delivery: { fr: 'Livraison 3 – 6 jours', ar: 'التوصيل خلال 3 – 6 أيام' },
      synthetic: true,
    },
  ],
  'skincare-set': [
    {
      id: 'offer-skincare-beaute-algerie',
      sellerId: 'beaute-algerie-demo',
      seller: { fr: 'Beauté d’Algérie', ar: 'جمال الجزائر' },
      price: 5900,
      oldPrice: 8900,
      stock: 15,
      sellerRating: 4.5,
      sellerReviews: 133,
      verified: false,
      shippingFee: 400,
      delivery: { fr: 'Livraison 2 – 4 jours', ar: 'التوصيل خلال 2 – 4 أيام' },
      synthetic: true,
    },
  ],
  'smartphone-5g-128': [
    {
      id: 'offer-smartphone-pixel-demo',
      sellerId: 'pixel-demo',
      seller: { fr: 'Pixel Démo', ar: 'بكسل تجريبي' },
      price: 48900,
      oldPrice: 52900,
      stock: 9,
      sellerRating: 4.7,
      sellerReviews: 287,
      verified: true,
      shippingFee: 0,
      delivery: { fr: 'Livraison 2 – 4 jours', ar: 'التوصيل خلال 2 – 4 أيام' },
      synthetic: true,
    },
    {
      id: 'offer-smartphone-techway',
      sellerId: 'techway-demo',
      seller: { fr: 'TechWay', ar: 'تك واي' },
      price: 49700,
      oldPrice: 53500,
      stock: 4,
      sellerRating: 4.4,
      sellerReviews: 205,
      verified: false,
      shippingFee: 450,
      delivery: { fr: 'Livraison 1 – 3 jours', ar: 'التوصيل خلال 1 – 3 أيام' },
      synthetic: true,
    },
  ],
  'coffee-maker-compact': [
    {
      id: 'offer-coffee-cuisine-demo',
      sellerId: 'cuisine-demo',
      seller: { fr: 'Cuisine Démo', ar: 'مطبخ تجريبي' },
      price: 11200,
      oldPrice: 12900,
      stock: 14,
      sellerRating: 4.6,
      sellerReviews: 156,
      verified: true,
      shippingFee: 450,
      delivery: { fr: 'Livraison 2 – 5 jours', ar: 'التوصيل خلال 2 – 5 أيام' },
      synthetic: true,
    },
  ],
  'air-conditioner-12000': [
    {
      id: 'offer-ac-maison-demo',
      sellerId: 'maison-demo',
      seller: { fr: 'Maison Démo', ar: 'منزل تجريبي' },
      price: 87900,
      oldPrice: 94900,
      stock: 5,
      sellerRating: 4.7,
      sellerReviews: 221,
      verified: true,
      shippingFee: 1200,
      delivery: { fr: 'Livraison 3 – 6 jours', ar: 'التوصيل خلال 3 – 6 أيام' },
      synthetic: true,
    },
  ],
  'car-organizer-foldable': [
    {
      id: 'offer-organizer-route-demo',
      sellerId: 'route-demo',
      seller: { fr: 'Route Démo', ar: 'طريق تجريبي' },
      price: 3400,
      oldPrice: 4200,
      stock: 22,
      sellerRating: 4.2,
      sellerReviews: 74,
      verified: false,
      shippingFee: 350,
      delivery: { fr: 'Livraison 2 – 4 jours', ar: 'التوصيل خلال 2 – 4 أيام' },
      synthetic: true,
    },
  ],
  'baby-changing-bag': [
    {
      id: 'offer-changing-bag-petit-monde',
      sellerId: 'petit-monde-demo',
      seller: { fr: 'Petit Monde Démo', ar: 'عالم صغير تجريبي' },
      price: 6300,
      oldPrice: 7500,
      stock: 11,
      sellerRating: 4.8,
      sellerReviews: 164,
      verified: true,
      shippingFee: 400,
      delivery: { fr: 'Livraison 2 – 4 jours', ar: 'التوصيل خلال 2 – 4 أيام' },
      synthetic: true,
    },
  ],
};

export const cartSellerGroups = [
  {
    id: 'cart-group-maison-plus',
    sellerId: 'maison-plus-demo',
    seller: { fr: 'Maison Plus', ar: 'ميزون بلس' },
    verified: true,
    shippingMethodId: 'standard',
    shippingFee: 450,
    delivery: { fr: 'Livraison estimée : 8 – 10 oct.', ar: 'التوصيل المتوقع: 8 – 10 أكتوبر' },
    items: [
      {
        id: 'cart-line-air-fryer',
        productId: 'air-fryer-5l',
        offerId: 'offer-air-fryer-maison-plus',
        name: { fr: 'Friteuse sans huile 5 L', ar: 'قلاية هوائية 5 لتر' },
        image: '/assets/product-air-fryer.png',
        unitPrice: 12500,
        oldPrice: 15900,
        quantity: 1,
        maxQuantity: 12,
        synthetic: true,
      },
    ],
  },
  {
    id: 'cart-group-techway',
    sellerId: 'techway-demo',
    seller: { fr: 'TechWay', ar: 'تك واي' },
    verified: false,
    shippingMethodId: 'standard',
    shippingFee: 600,
    delivery: { fr: 'Livraison estimée : 8 – 10 oct.', ar: 'التوصيل المتوقع: 8 – 10 أكتوبر' },
    items: [
      {
        id: 'cart-line-earbuds',
        productId: 'earbuds-wireless',
        offerId: 'offer-earbuds-techway',
        name: { fr: 'Écouteurs sans fil', ar: 'سماعات لاسلكية' },
        image: '/assets/product-earbuds.png',
        unitPrice: 6900,
        oldPrice: 8900,
        quantity: 1,
        maxQuantity: 8,
        synthetic: true,
      },
    ],
  },
];

export const savedAddresses = [
  {
    id: 'demo-address-alger',
    label: { fr: 'Adresse de démonstration', ar: 'عنوان تجريبي' },
    recipient: 'Compte test Atlas · حساب تجريبي',
    phone: '0000 00 00 00',
    phoneMasked: '00•• •• •• ••',
    line1: { fr: '12, rue du Prototype', ar: '12، شارع النموذج التجريبي' },
    addressLine: { fr: '12, rue du Prototype', ar: '12، شارع النموذج التجريبي' },
    wilayaId: '16',
    wilaya: { fr: 'Alger', ar: 'الجزائر' },
    commune: { fr: 'Alger Centre', ar: 'الجزائر الوسطى' },
    instructions: { fr: 'Données fictives — ne pas livrer', ar: 'بيانات خيالية — لا يتم التوصيل' },
    isDefault: true,
    synthetic: true,
  },
  {
    id: 'demo-address-oran',
    label: { fr: 'Point test secondaire', ar: 'نقطة تجريبية ثانوية' },
    recipient: 'Compte test Atlas · حساب تجريبي',
    phone: '0000 00 00 00',
    phoneMasked: '00•• •• •• ••',
    line1: { fr: '8, avenue de la Maquette', ar: '8، شارع النموذج' },
    addressLine: { fr: '8, avenue de la Maquette', ar: '8، شارع النموذج' },
    wilayaId: '31',
    wilaya: { fr: 'Oran', ar: 'وهران' },
    commune: { fr: 'Oran Centre', ar: 'وسط وهران' },
    instructions: { fr: 'Données fictives — ne pas livrer', ar: 'بيانات خيالية — لا يتم التوصيل' },
    isDefault: false,
    synthetic: true,
  },
];

export const shippingMethods = [
  {
    id: 'standard',
    label: { fr: 'Livraison standard', ar: 'توصيل عادي' },
    name: { fr: 'Livraison standard', ar: 'توصيل عادي' },
    eta: { fr: '2 à 5 jours ouvrés', ar: 'من يومين إلى 5 أيام عمل' },
    description: {
      fr: 'Suivi inclus · 2 à 5 jours ouvrés',
      ar: 'التتبع مشمول · من يومين إلى 5 أيام عمل',
    },
    price: 450,
    priceFrom: 350,
    supportsCod: true,
    synthetic: true,
  },
  {
    id: 'express',
    label: { fr: 'Livraison express', ar: 'توصيل سريع' },
    name: { fr: 'Livraison express', ar: 'توصيل سريع' },
    eta: { fr: '1 à 2 jours ouvrés', ar: 'من يوم إلى يومي عمل' },
    description: {
      fr: 'Selon le vendeur · 1 à 2 jours ouvrés',
      ar: 'حسب البائع · من يوم إلى يومي عمل',
    },
    price: 900,
    priceFrom: 900,
    supportsCod: true,
    synthetic: true,
  },
];

export const checkoutSeed = {
  id: 'checkout-demo-001',
  orderReference: 'DEMO-DZ-1091',
  placedAt: { fr: '5 oct. 2026', ar: '5 أكتوبر 2026' },
  addressId: 'demo-address-alger',
  sellerGroups: cartSellerGroups,
  shippingSelections: {
    'maison-plus-demo': 'standard',
    'techway-demo': 'standard',
  },
  paymentMethodId: 'cod',
  paymentMethods: [
    {
      id: 'cod',
      name: { fr: 'Paiement à la livraison', ar: 'الدفع عند الاستلام' },
      description: {
        fr: 'Payez en espèces à la réception de cette commande démo.',
        ar: 'ادفع نقداً عند استلام هذا الطلب التجريبي.',
      },
      fee: 200,
      enabled: true,
    },
    {
      id: 'card',
      name: { fr: 'Carte bancaire', ar: 'بطاقة بنكية' },
      description: { fr: 'Indisponible dans ce prototype.', ar: 'غير متاحة في هذا النموذج.' },
      fee: 0,
      enabled: false,
    },
  ],
  pricing: {
    subtotal: 19400,
    shipping: 1050,
    codFee: 200,
    total: 20650,
  },
  timeline: [
    {
      id: 'confirmed',
      label: { fr: 'Commande confirmée', ar: 'تم تأكيد الطلب' },
      at: { fr: '5 oct. · 10:30', ar: '5 أكتوبر · 10:30' },
      complete: true,
    },
    {
      id: 'preparing',
      label: { fr: 'Préparation par les vendeurs', ar: 'التحضير لدى البائعين' },
      at: { fr: 'Étape suivante', ar: 'المرحلة التالية' },
      complete: false,
    },
    {
      id: 'shipped',
      label: { fr: 'Colis expédiés', ar: 'تم شحن الطرود' },
      at: { fr: 'À venir', ar: 'قريباً' },
      complete: false,
    },
    {
      id: 'delivered',
      label: { fr: 'Livraison', ar: 'التوصيل' },
      at: { fr: 'À venir', ar: 'قريباً' },
      complete: false,
    },
  ],
  itemCount: 2,
  prototypeOnly: true,
  synthetic: true,
};

export const orders = [
  {
    id: 'DEMO-DZ-1088',
    reference: 'DEMO-DZ-1088',
    placedAt: '05/10/2026',
    placedAtIso: '2026-10-05T10:30:00+01:00',
    statusId: 'confirmed',
    status: { fr: 'Confirmée', ar: 'مؤكد' },
    total: 20650,
    image: '/assets/product-air-fryer.png',
    itemCount: 2,
    sellerGroups: cartSellerGroups,
    address: savedAddresses[0],
    paymentMethodId: 'cod',
    pricing: checkoutSeed.pricing,
    timeline: [
      {
        id: 'confirmed',
        label: { fr: 'Commande confirmée', ar: 'تم تأكيد الطلب' },
        at: { fr: '5 oct. · 10:30', ar: '5 أكتوبر · 10:30' },
        complete: true,
      },
      {
        id: 'preparing',
        label: { fr: 'Préparation par les vendeurs', ar: 'التحضير لدى البائعين' },
        at: { fr: 'Étape suivante', ar: 'المرحلة التالية' },
        complete: false,
      },
      {
        id: 'shipped',
        label: { fr: 'Colis expédiés', ar: 'تم شحن الطرود' },
        at: { fr: 'À venir', ar: 'قريباً' },
        complete: false,
      },
      {
        id: 'delivered',
        label: { fr: 'Livraison', ar: 'التوصيل' },
        at: { fr: 'À venir', ar: 'قريباً' },
        complete: false,
      },
    ],
    synthetic: true,
  },
  {
    id: 'DEMO-DZ-1042',
    reference: 'DEMO-DZ-1042',
    placedAt: '18/09/2026',
    placedAtIso: '2026-09-18T14:10:00+01:00',
    statusId: 'delivered',
    status: { fr: 'Livrée', ar: 'تم التوصيل' },
    deliveredAt: '2026-09-22T16:25:00+01:00',
    total: 11850,
    image: '/assets/category-kitchen.png',
    itemCount: 1,
    sellerGroups: [
      {
        id: 'order-group-cuisine-demo',
        sellerId: 'cuisine-demo',
        seller: { fr: 'Cuisine Démo', ar: 'مطبخ تجريبي' },
        verified: true,
        shippingMethodId: 'standard',
        shippingFee: 450,
        delivery: { fr: 'Livré le 22 sept.', ar: 'تم التوصيل في 22 سبتمبر' },
        items: [
          {
            id: 'order-line-coffee-maker',
            productId: 'coffee-maker-compact',
            offerId: 'offer-coffee-cuisine-demo',
            name: { fr: 'Machine à café compacte', ar: 'آلة قهوة مدمجة' },
            image: '/assets/category-kitchen.png',
            unitPrice: 11200,
            oldPrice: 12900,
            quantity: 1,
            maxQuantity: 14,
            synthetic: true,
          },
        ],
      },
    ],
    address: savedAddresses[1],
    paymentMethodId: 'cod',
    pricing: { subtotal: 11200, shipping: 450, codFee: 200, total: 11850 },
    timeline: [
      {
        id: 'confirmed',
        label: { fr: 'Commande confirmée', ar: 'تم تأكيد الطلب' },
        at: { fr: '18 sept. · 14:10', ar: '18 سبتمبر · 14:10' },
        complete: true,
      },
      {
        id: 'preparing',
        label: { fr: 'Préparation terminée', ar: 'اكتمل التحضير' },
        at: { fr: '19 sept. · 09:15', ar: '19 سبتمبر · 09:15' },
        complete: true,
      },
      {
        id: 'shipped',
        label: { fr: 'Colis expédié', ar: 'تم شحن الطرد' },
        at: { fr: '20 sept. · 11:40', ar: '20 سبتمبر · 11:40' },
        complete: true,
      },
      {
        id: 'delivered',
        label: { fr: 'Livré', ar: 'تم التوصيل' },
        at: { fr: '22 sept. · 16:25', ar: '22 سبتمبر · 16:25' },
        complete: true,
      },
    ],
    synthetic: true,
  },
];

export function formatDzd(amount, locale) {
  const formatted = new Intl.NumberFormat(locale === 'ar' ? 'ar-DZ' : 'fr-DZ', {
    maximumFractionDigits: 0,
  }).format(amount);
  return `${formatted}\u00a0DZD`;
}

export function formatRating(value, locale) {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-DZ' : 'fr-DZ', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}
