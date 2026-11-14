import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bank,
  CaretDown,
  Check,
  CheckCircle,
  Clock,
  CreditCard,
  Heart,
  House,
  MapPin,
  Minus,
  Package,
  Plus,
  ShieldCheck,
  ShoppingCart,
  Star,
  Storefront,
  Truck,
  Wallet,
} from '@phosphor-icons/react';
import {
  categories,
  checkoutSeed,
  formatDzd,
  formatRating,
  orders,
  productOffers,
  products,
  savedAddresses,
  shippingMethods,
} from './catalog.js';

const labels = {
  fr: {
    back: 'Retour',
    results: 'résultats',
    filters: 'Filtres',
    all: 'Tout',
    sort: 'Trier',
    recommended: 'Recommandés',
    priceLow: 'Prix croissant',
    rating: 'Mieux notés',
    add: 'Ajouter',
    details: 'Voir le produit',
    inStock: 'En stock',
    unavailable: 'Indisponible',
    soldBy: 'Vendu par',
    verified: 'Vendeur contrôlé',
    offers: 'Comparer les offres',
    chooseOffer: 'Choisir cette offre',
    productDetails: 'Détails du produit',
    highlights: 'Points forts',
    wishlist: 'Enregistrer',
    deliveryTo: 'Livraison vers',
    cartTitle: 'Votre panier',
    cartEmpty: 'Votre panier est vide',
    cartEmptyBody: 'Ajoutez un produit pour préparer votre commande.',
    continueShopping: 'Découvrir les produits',
    quantity: 'Quantité',
    remove: 'Retirer',
    sellerGroup: 'Expédié par',
    summary: 'Récapitulatif',
    subtotal: 'Sous-total',
    estimatedDelivery: 'Livraison estimée',
    total: 'Total estimé',
    checkout: 'Passer au paiement',
    priceNotice: 'Le prix total et les délais sont confirmés avant la commande.',
    address: 'Adresse',
    shipping: 'Livraison',
    payment: 'Paiement',
    review: 'Vérification',
    confirmation: 'Confirmation',
    addressTitle: 'Où souhaitez-vous être livré ?',
    addressBody: 'Choisissez une adresse enregistrée pour cette commande.',
    selected: 'Sélectionné',
    useAddress: 'Livrer ici',
    nextShipping: 'Continuer vers la livraison',
    shippingTitle: 'Choisissez la livraison',
    shippingBody: 'Les délais sont indiqués par groupe vendeur.',
    nextPayment: 'Continuer vers le paiement',
    paymentTitle: 'Comment souhaitez-vous payer ?',
    cod: 'Paiement à la livraison',
    codBody: 'Payez le montant affiché à la remise du colis.',
    card: 'Paiement électronique',
    cardDisabled: 'Désactivé jusqu’à certification d’un fournisseur autorisé.',
    nextReview: 'Vérifier la commande',
    reviewTitle: 'Vérifiez avant de confirmer',
    reviewBody: 'Adresse, livraison, articles et total restent modifiables avant confirmation.',
    contractConsent:
      'J’ai vérifié les articles, le prix total, l’adresse et les conditions affichées.',
    placeOrder: 'Confirmer la commande COD',
    confirmationTitle: 'Commande confirmée',
    confirmationBody:
      'Votre commande a été enregistrée. Chaque colis peut maintenant être suivi séparément.',
    orderReference: 'Référence',
    trackOrder: 'Voir le suivi',
    keepShopping: 'Continuer mes achats',
    ordersTitle: 'Mes commandes',
    ordersBody: 'Suivez les colis, les paiements et les actions disponibles.',
    orderDetails: 'Détails de la commande',
    status: 'Statut',
    orderedOn: 'Commandé le',
    timeline: 'Suivi',
    help: 'Besoin d’aide ?',
    helpBody: 'Retrouvez les réponses sur la livraison, les paiements et les retours.',
    accountTitle: 'Bonjour, client démo',
    accountBody: 'Le compte de démonstration utilise uniquement des données synthétiques.',
    noResults: 'Aucun produit ne correspond à cette recherche.',
    resetSearch: 'Voir tout le catalogue',
  },
  ar: {
    back: 'رجوع',
    results: 'نتائج',
    filters: 'التصفية',
    all: 'الكل',
    sort: 'الترتيب',
    recommended: 'موصى به',
    priceLow: 'السعر تصاعدياً',
    rating: 'الأعلى تقييماً',
    add: 'أضف',
    details: 'عرض المنتج',
    inStock: 'متوفر',
    unavailable: 'غير متوفر',
    soldBy: 'يباع من طرف',
    verified: 'بائع خضع للتحقق',
    offers: 'مقارنة العروض',
    chooseOffer: 'اختر هذا العرض',
    productDetails: 'تفاصيل المنتج',
    highlights: 'أهم المزايا',
    wishlist: 'حفظ',
    deliveryTo: 'التوصيل إلى',
    cartTitle: 'سلة التسوق',
    cartEmpty: 'سلتك فارغة',
    cartEmptyBody: 'أضف منتجاً لتحضير طلبك.',
    continueShopping: 'استكشف المنتجات',
    quantity: 'الكمية',
    remove: 'حذف',
    sellerGroup: 'يشحن من طرف',
    summary: 'الملخص',
    subtotal: 'المجموع الفرعي',
    estimatedDelivery: 'التوصيل التقديري',
    total: 'المجموع التقديري',
    checkout: 'متابعة الدفع',
    priceNotice: 'يتم تأكيد السعر الكامل والآجال قبل الطلب.',
    address: 'العنوان',
    shipping: 'التوصيل',
    payment: 'الدفع',
    review: 'المراجعة',
    confirmation: 'التأكيد',
    addressTitle: 'أين تريد استلام طلبك؟',
    addressBody: 'اختر عنواناً محفوظاً لهذا الطلب.',
    selected: 'محدد',
    useAddress: 'التوصيل هنا',
    nextShipping: 'متابعة اختيار التوصيل',
    shippingTitle: 'اختر طريقة التوصيل',
    shippingBody: 'تظهر الآجال لكل مجموعة بائع.',
    nextPayment: 'متابعة الدفع',
    paymentTitle: 'كيف تريد الدفع؟',
    cod: 'الدفع عند الاستلام',
    codBody: 'ادفع المبلغ الظاهر عند استلام الطرد.',
    card: 'الدفع الإلكتروني',
    cardDisabled: 'معطل إلى حين اعتماد مزود مرخص.',
    nextReview: 'مراجعة الطلب',
    reviewTitle: 'راجع قبل التأكيد',
    reviewBody: 'يمكن تعديل العنوان والتوصيل والمنتجات والمجموع قبل التأكيد.',
    contractConsent: 'راجعت المنتجات والسعر الكامل والعنوان والشروط المعروضة.',
    placeOrder: 'تأكيد طلب الدفع عند الاستلام',
    confirmationTitle: 'تم تأكيد الطلب',
    confirmationBody: 'تم تسجيل طلبك ويمكنك الآن تتبع كل طرد على حدة.',
    orderReference: 'المرجع',
    trackOrder: 'عرض التتبع',
    keepShopping: 'متابعة التسوق',
    ordersTitle: 'طلباتي',
    ordersBody: 'تابع الطرود والمدفوعات والإجراءات المتاحة.',
    orderDetails: 'تفاصيل الطلب',
    status: 'الحالة',
    orderedOn: 'تاريخ الطلب',
    timeline: 'التتبع',
    help: 'هل تحتاج مساعدة؟',
    helpBody: 'اعثر على إجابات حول التوصيل والدفع والإرجاع.',
    accountTitle: 'مرحباً، عميل التجربة',
    accountBody: 'يستخدم الحساب التجريبي بيانات اصطناعية فقط.',
    noResults: 'لا توجد منتجات تطابق هذا البحث.',
    resetSearch: 'عرض كل المنتجات',
  },
};

const stepRoutes = [
  ['address', '/checkout/address'],
  ['shipping', '/checkout/shipping'],
  ['payment', '/checkout/payment'],
  ['review', '/checkout/review'],
];

function DirectionalArrow({ locale, size = 18 }) {
  const Icon = locale === 'ar' ? ArrowLeft : ArrowRight;
  return <Icon aria-hidden="true" size={size} />;
}

function Breadcrumbs({ locale, items, onNavigate }) {
  return (
    <nav className="breadcrumbs" aria-label={locale === 'ar' ? 'مسار الصفحة' : 'Fil d’Ariane'}>
      <button onClick={() => onNavigate('/')}>
        <House aria-hidden="true" size={16} />
        atlas dz
      </button>
      {items.map((item) => (
        <span key={item.label}>
          <DirectionalArrow locale={locale} size={14} />
          {item.path ? (
            <button onClick={() => onNavigate(item.path)}>{item.label}</button>
          ) : (
            <b>{item.label}</b>
          )}
        </span>
      ))}
    </nav>
  );
}

export function ProductTile({ product, locale, onNavigate, onAdd }) {
  const l = labels[locale];
  const available = product.stock > 0;
  return (
    <article className="catalog-card">
      <button
        className="catalog-card__open"
        onClick={() => onNavigate(`/product/${product.id}`)}
        aria-label={`${l.details}: ${product.name[locale]}`}
      >
        <span className="catalog-card__image">
          <img src={product.image} alt="" loading="lazy" />
        </span>
        <span className="catalog-card__content">
          <strong>{product.name[locale]}</strong>
          <span className="rating-row">
            <Star aria-hidden="true" size={16} weight="fill" />
            {formatRating(product.rating, locale)} ({product.reviews})
          </span>
          <span className="catalog-card__price">
            <bdi>{formatDzd(product.price, locale)}</bdi>
            <del>
              <bdi>{formatDzd(product.oldPrice, locale)}</bdi>
            </del>
          </span>
          <span className="seller-row">
            <Storefront aria-hidden="true" size={16} />
            {product.seller[locale]}
          </span>
          <span className={`stock-row ${available ? 'is-available' : 'is-unavailable'}`}>
            <i aria-hidden="true" />
            {available ? l.inStock : l.unavailable}
          </span>
          <span className="delivery-row">
            <Truck aria-hidden="true" size={15} />
            {product.delivery[locale]}
          </span>
        </span>
      </button>
      <button disabled={!available} className="catalog-card__add" onClick={() => onAdd(product)}>
        <ShoppingCart aria-hidden="true" size={19} />
        {l.add}
      </button>
    </article>
  );
}

function BrowsePage({ locale, route, onNavigate, onAdd }) {
  const l = labels[locale];
  const params = new URLSearchParams(route.search);
  const query = params.get('q')?.trim() ?? '';
  const categoryId = route.pathname.startsWith('/category/')
    ? decodeURIComponent(route.pathname.slice(10))
    : null;
  const category = categories.find((candidate) => candidate.id === categoryId);
  const [sort, setSort] = useState('recommended');
  const [activeCategory, setActiveCategory] = useState(categoryId ?? 'all');
  const visibleProducts = useMemo(() => {
    const needle = query.toLocaleLowerCase(locale === 'ar' ? 'ar' : 'fr');
    let next = products.filter((product) => {
      const matchesQuery =
        !needle ||
        [product.name[locale], product.seller[locale], ...(product.searchTerms?.[locale] ?? [])]
          .join(' ')
          .toLocaleLowerCase(locale === 'ar' ? 'ar' : 'fr')
          .includes(needle);
      const matchesCategory = activeCategory === 'all' || product.category === activeCategory;
      return matchesQuery && matchesCategory;
    });
    if (sort === 'price') next = [...next].sort((a, b) => a.price - b.price);
    if (sort === 'rating') next = [...next].sort((a, b) => b.rating - a.rating);
    return next;
  }, [activeCategory, locale, query, sort]);
  const title =
    category?.label[locale] ??
    (query
      ? `${locale === 'ar' ? 'نتائج' : 'Résultats pour'} « ${query} »`
      : locale === 'ar'
        ? 'كل المنتجات'
        : 'Tous les produits');

  return (
    <div className="page-shell">
      <Breadcrumbs locale={locale} items={[{ label: title }]} onNavigate={onNavigate} />
      <header className="page-heading">
        <div>
          <p className="page-kicker">{locale === 'ar' ? 'اكتشف وقارن' : 'Découvrez et comparez'}</p>
          <h1>{title}</h1>
          <p>
            {visibleProducts.length} {l.results}
          </p>
        </div>
      </header>
      <div className="browse-toolbar">
        <div className="filter-chips" aria-label={l.filters}>
          <button
            className={activeCategory === 'all' ? 'is-selected' : ''}
            onClick={() => setActiveCategory('all')}
          >
            {l.all}
          </button>
          {categories.map((item) => (
            <button
              className={activeCategory === item.id ? 'is-selected' : ''}
              key={item.id}
              onClick={() => setActiveCategory(item.id)}
            >
              {item.label[locale]}
            </button>
          ))}
        </div>
        <label className="sort-control">
          <span>{l.sort}</span>
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="recommended">{l.recommended}</option>
            <option value="price">{l.priceLow}</option>
            <option value="rating">{l.rating}</option>
          </select>
          <CaretDown aria-hidden="true" size={16} />
        </label>
      </div>
      {visibleProducts.length ? (
        <div className="catalog-grid">
          {visibleProducts.map((product) => (
            <ProductTile
              key={product.id}
              product={product}
              locale={locale}
              onNavigate={onNavigate}
              onAdd={onAdd}
            />
          ))}
        </div>
      ) : (
        <section className="flow-empty">
          <Package aria-hidden="true" size={48} />
          <h2>{l.noResults}</h2>
          <button className="button-primary" onClick={() => onNavigate('/search')}>
            {l.resetSearch}
          </button>
        </section>
      )}
    </div>
  );
}

function ProductPage({ locale, productId, location, onNavigate, onAdd }) {
  const l = labels[locale];
  const product = products.find((candidate) => candidate.id === productId);
  const [selectedOffer, setSelectedOffer] = useState(0);
  if (!product) return <NotFoundPage locale={locale} onNavigate={onNavigate} />;
  const offers = productOffers[product.id] ?? [
    {
      seller: product.seller,
      price: product.price,
      delivery: product.delivery,
      verified: product.verified,
      stock: product.stock,
    },
  ];
  const offer = offers[selectedOffer] ?? offers[0];
  return (
    <div className="page-shell product-page">
      <Breadcrumbs
        locale={locale}
        items={[
          {
            label: categories.find((item) => item.id === product.category)?.label[locale] ?? l.all,
            path: `/category/${product.category}`,
          },
          { label: product.name[locale] },
        ]}
        onNavigate={onNavigate}
      />
      <section className="product-hero">
        <div className="product-gallery">
          <div className="product-gallery__main">
            <img src={product.image} alt={product.name[locale]} />
          </div>
          <div className="product-gallery__rail">
            {[product.image, ...(product.gallery ?? [])].slice(0, 3).map((image, index) => (
              <button
                aria-label={
                  locale === 'ar' ? `صورة المنتج ${index + 1}` : `Vue du produit ${index + 1}`
                }
                className={index === 0 ? 'is-selected' : ''}
                key={`${image}-${index}`}
              >
                <img src={image} alt="" />
              </button>
            ))}
          </div>
        </div>
        <div className="product-info">
          <p className="product-brand">{product.brand?.[locale] ?? product.seller[locale]}</p>
          <h1>{product.name[locale]}</h1>
          <div className="product-rating">
            <span>
              <Star aria-hidden="true" size={19} weight="fill" />
              {formatRating(product.rating, locale)}
            </span>
            <button>
              {product.reviews} {locale === 'ar' ? 'تقييماً' : 'avis'}
            </button>
          </div>
          <p className="product-description">
            {product.description?.[locale] ?? product.delivery[locale]}
          </p>
          <div className="product-price">
            <bdi>{formatDzd(offer.price, locale)}</bdi>
            {product.oldPrice > offer.price && (
              <del>
                <bdi>{formatDzd(product.oldPrice, locale)}</bdi>
              </del>
            )}
          </div>
          <div className="delivery-promise">
            <MapPin aria-hidden="true" size={20} weight="fill" />
            <div>
              <b>
                {l.deliveryTo} {location}
              </b>
              <span>{offer.delivery[locale]}</span>
            </div>
          </div>
          <div className="product-actions">
            <button
              className="button-primary button-large"
              disabled={offer.stock <= 0}
              onClick={() => onAdd({ ...product, price: offer.price, seller: offer.seller })}
            >
              <ShoppingCart aria-hidden="true" size={21} />
              {l.add}
            </button>
            <button className="button-secondary button-large">
              <Heart aria-hidden="true" size={21} />
              {l.wishlist}
            </button>
          </div>
          <div className="product-assurances">
            <span>
              <ShieldCheck aria-hidden="true" size={20} />
              {l.verified}
            </span>
            <span>
              <Package aria-hidden="true" size={20} />
              {locale === 'ar' ? 'إرجاع قابل للتتبع' : 'Retour suivi'}
            </span>
          </div>
        </div>
      </section>
      <section className="offers-panel" aria-labelledby="offers-title">
        <div className="section-heading">
          <h2 id="offers-title">{l.offers}</h2>
        </div>
        <div className="offer-list">
          {offers.map((candidate, index) => (
            <button
              className={selectedOffer === index ? 'is-selected' : ''}
              key={`${candidate.seller.fr}-${candidate.price}`}
              onClick={() => setSelectedOffer(index)}
            >
              <span className="offer-radio" aria-hidden="true">
                {selectedOffer === index && <Check size={14} weight="bold" />}
              </span>
              <span>
                <b>{candidate.seller[locale]}</b>
                {candidate.verified && (
                  <small>
                    <ShieldCheck size={15} weight="fill" />
                    {l.verified}
                  </small>
                )}
              </span>
              <span>{candidate.delivery[locale]}</span>
              <strong>
                <bdi>{formatDzd(candidate.price, locale)}</bdi>
              </strong>
            </button>
          ))}
        </div>
      </section>
      <section className="product-detail-grid">
        <article>
          <h2>{l.highlights}</h2>
          <ul>
            {(product.features?.[locale] ?? [product.delivery[locale]]).map((feature) => (
              <li key={feature}>
                <CheckCircle aria-hidden="true" size={19} weight="fill" />
                {feature}
              </li>
            ))}
          </ul>
        </article>
        <article>
          <h2>{l.productDetails}</h2>
          <dl>
            {Object.entries(product.specs?.[locale] ?? {}).map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </article>
      </section>
    </div>
  );
}

function CartPage({ locale, cartItems, onNavigate, onQuantity }) {
  const l = labels[locale];
  if (cartItems.length === 0)
    return (
      <div className="page-shell">
        <Breadcrumbs locale={locale} items={[{ label: l.cartTitle }]} onNavigate={onNavigate} />
        <section className="flow-empty flow-empty--large">
          <ShoppingCart aria-hidden="true" size={58} />
          <h1>{l.cartEmpty}</h1>
          <p>{l.cartEmptyBody}</p>
          <button className="button-primary" onClick={() => onNavigate('/search')}>
            {l.continueShopping}
          </button>
        </section>
      </div>
    );
  const groups = cartItems.reduce((sellerGroups, item) => {
    const seller = item.product.seller[locale];
    sellerGroups.set(seller, [...(sellerGroups.get(seller) ?? []), item]);
    return sellerGroups;
  }, new Map());
  const subtotal = cartItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const delivery = groups.size * 600;
  return (
    <div className="page-shell">
      <Breadcrumbs locale={locale} items={[{ label: l.cartTitle }]} onNavigate={onNavigate} />
      <header className="page-heading">
        <h1>{l.cartTitle}</h1>
        <p>
          {cartItems.reduce((sum, item) => sum + item.quantity, 0)}{' '}
          {locale === 'ar' ? 'منتجات' : 'articles'}
        </p>
      </header>
      <div className="cart-layout">
        <div className="cart-groups">
          {[...groups.entries()].map(([seller, items]) => (
            <section className="cart-group" key={seller}>
              <header>
                <Storefront aria-hidden="true" size={20} />
                <span>{l.sellerGroup}</span>
                <b>{seller}</b>
              </header>
              {items.map(({ product, quantity }) => (
                <article className="cart-line" key={product.id}>
                  <button
                    className="cart-line__image"
                    onClick={() => onNavigate(`/product/${product.id}`)}
                  >
                    <img src={product.image} alt={product.name[locale]} />
                  </button>
                  <div className="cart-line__copy">
                    <h2>{product.name[locale]}</h2>
                    <p>{product.delivery[locale]}</p>
                    <strong>
                      <bdi>{formatDzd(product.price, locale)}</bdi>
                    </strong>
                  </div>
                  <div
                    className="quantity-control"
                    aria-label={`${l.quantity}: ${product.name[locale]}`}
                  >
                    <button
                      aria-label={`${l.remove} ${product.name[locale]}`}
                      onClick={() => onQuantity(product.id, quantity - 1)}
                    >
                      <Minus size={17} />
                    </button>
                    <span>{quantity}</span>
                    <button
                      aria-label={`${l.add} ${product.name[locale]}`}
                      onClick={() => onQuantity(product.id, quantity + 1)}
                    >
                      <Plus size={17} />
                    </button>
                  </div>
                </article>
              ))}
            </section>
          ))}
        </div>
        <aside className="order-summary">
          <h2>{l.summary}</h2>
          <dl>
            <div>
              <dt>{l.subtotal}</dt>
              <dd>
                <bdi>{formatDzd(subtotal, locale)}</bdi>
              </dd>
            </div>
            <div>
              <dt>{l.estimatedDelivery}</dt>
              <dd>
                <bdi>{formatDzd(delivery, locale)}</bdi>
              </dd>
            </div>
            <div className="summary-total">
              <dt>{l.total}</dt>
              <dd>
                <bdi>{formatDzd(subtotal + delivery, locale)}</bdi>
              </dd>
            </div>
          </dl>
          <p>
            <ShieldCheck aria-hidden="true" size={19} />
            {l.priceNotice}
          </p>
          <button
            className="button-primary button-large"
            onClick={() => onNavigate('/checkout/address')}
          >
            {l.checkout}
            <DirectionalArrow locale={locale} />
          </button>
        </aside>
      </div>
    </div>
  );
}

function CheckoutProgress({ locale, current, onNavigate }) {
  const l = labels[locale];
  const currentIndex = stepRoutes.findIndex(([step]) => step === current);
  return (
    <nav
      className="checkout-progress"
      aria-label={locale === 'ar' ? 'مراحل الطلب' : 'Étapes de commande'}
    >
      {stepRoutes.map(([step, path], index) => (
        <button
          key={step}
          disabled={index > currentIndex}
          className={
            index === currentIndex ? 'is-current' : index < currentIndex ? 'is-complete' : ''
          }
          onClick={() => index <= currentIndex && onNavigate(path)}
        >
          <span>{index < currentIndex ? <Check size={15} weight="bold" /> : index + 1}</span>
          {l[step]}
        </button>
      ))}
    </nav>
  );
}

function CheckoutPage({
  locale,
  step,
  cartItems,
  checkout,
  setCheckout,
  onNavigate,
  onPlaceOrder,
}) {
  const l = labels[locale];
  if (step === 'confirmation')
    return <ConfirmationPage locale={locale} checkout={checkout} onNavigate={onNavigate} />;
  const subtotal = cartItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const selectedAddress =
    savedAddresses.find((address) => address.id === checkout.addressId) ?? savedAddresses[0];
  const selectedShipping =
    shippingMethods.find((method) => method.id === checkout.shippingId) ?? shippingMethods[0];
  const total = subtotal + (selectedShipping?.price ?? 0);
  return (
    <div className="checkout-shell">
      <button
        className="checkout-back"
        onClick={() =>
          onNavigate(
            step === 'address'
              ? '/cart'
              : stepRoutes[Math.max(0, stepRoutes.findIndex(([name]) => name === step) - 1)][1],
          )
        }
      >
        <ArrowLeft aria-hidden="true" size={18} />
        {l.back}
      </button>
      <CheckoutProgress locale={locale} current={step} onNavigate={onNavigate} />
      {step === 'address' && (
        <section className="checkout-card">
          <header>
            <MapPin aria-hidden="true" size={28} weight="duotone" />
            <div>
              <h1>{l.addressTitle}</h1>
              <p>{l.addressBody}</p>
            </div>
          </header>
          <div className="selection-list">
            {savedAddresses.map((address) => (
              <button
                className={checkout.addressId === address.id ? 'is-selected' : ''}
                key={address.id}
                onClick={() => setCheckout((current) => ({ ...current, addressId: address.id }))}
              >
                <span className="selection-radio">
                  {checkout.addressId === address.id && <Check size={15} weight="bold" />}
                </span>
                <span>
                  <b>{address.label[locale]}</b>
                  <small>
                    {address.recipient} · {address.phoneMasked}
                  </small>
                  <small>
                    {address.line1[locale]}, {address.commune[locale]}, {address.wilaya[locale]}
                  </small>
                </span>
                {checkout.addressId === address.id && <em>{l.selected}</em>}
              </button>
            ))}
          </div>
          <div className="checkout-actions">
            <button
              className="button-primary button-large"
              onClick={() => onNavigate('/checkout/shipping')}
            >
              {l.nextShipping}
              <DirectionalArrow locale={locale} />
            </button>
          </div>
        </section>
      )}
      {step === 'shipping' && (
        <section className="checkout-card">
          <header>
            <Truck aria-hidden="true" size={28} weight="duotone" />
            <div>
              <h1>{l.shippingTitle}</h1>
              <p>{l.shippingBody}</p>
            </div>
          </header>
          <div className="selection-list">
            {shippingMethods.map((method) => (
              <button
                className={checkout.shippingId === method.id ? 'is-selected' : ''}
                key={method.id}
                onClick={() => setCheckout((current) => ({ ...current, shippingId: method.id }))}
              >
                <span className="selection-radio">
                  {checkout.shippingId === method.id && <Check size={15} weight="bold" />}
                </span>
                <span>
                  <b>{method.label[locale]}</b>
                  <small>{method.eta[locale]}</small>
                  <small>{method.description[locale]}</small>
                </span>
                <strong>
                  <bdi>{formatDzd(method.price, locale)}</bdi>
                </strong>
              </button>
            ))}
          </div>
          <div className="checkout-actions">
            <button
              className="button-primary button-large"
              onClick={() => onNavigate('/checkout/payment')}
            >
              {l.nextPayment}
              <DirectionalArrow locale={locale} />
            </button>
          </div>
        </section>
      )}
      {step === 'payment' && (
        <section className="checkout-card">
          <header>
            <Wallet aria-hidden="true" size={28} weight="duotone" />
            <div>
              <h1>{l.paymentTitle}</h1>
            </div>
          </header>
          <div className="payment-options">
            <button className="payment-option is-selected">
              <span className="payment-icon">
                <Bank size={25} />
              </span>
              <span>
                <b>{l.cod}</b>
                <small>{l.codBody}</small>
              </span>
              <span className="selection-radio">
                <Check size={15} weight="bold" />
              </span>
            </button>
            <button className="payment-option" disabled>
              <span className="payment-icon">
                <CreditCard size={25} />
              </span>
              <span>
                <b>{l.card}</b>
                <small>{l.cardDisabled}</small>
              </span>
            </button>
          </div>
          <div className="checkout-actions">
            <button
              className="button-primary button-large"
              onClick={() => onNavigate('/checkout/review')}
            >
              {l.nextReview}
              <DirectionalArrow locale={locale} />
            </button>
          </div>
        </section>
      )}
      {step === 'review' && (
        <section className="checkout-card review-card">
          <header>
            <ShieldCheck aria-hidden="true" size={28} weight="duotone" />
            <div>
              <h1>{l.reviewTitle}</h1>
              <p>{l.reviewBody}</p>
            </div>
          </header>
          <div className="review-grid">
            <article>
              <h2>{l.address}</h2>
              <p>
                <b>{selectedAddress.label[locale]}</b>
                <br />
                {selectedAddress.line1[locale]}
                <br />
                {selectedAddress.commune[locale]}, {selectedAddress.wilaya[locale]}
              </p>
              <button onClick={() => onNavigate('/checkout/address')}>
                {locale === 'ar' ? 'تعديل' : 'Modifier'}
              </button>
            </article>
            <article>
              <h2>{l.shipping}</h2>
              <p>
                <b>{selectedShipping.label[locale]}</b>
                <br />
                {selectedShipping.eta[locale]}
              </p>
              <button onClick={() => onNavigate('/checkout/shipping')}>
                {locale === 'ar' ? 'تعديل' : 'Modifier'}
              </button>
            </article>
            <article>
              <h2>{l.payment}</h2>
              <p>
                <b>{l.cod}</b>
                <br />
                {l.codBody}
              </p>
              <button onClick={() => onNavigate('/checkout/payment')}>
                {locale === 'ar' ? 'تعديل' : 'Modifier'}
              </button>
            </article>
          </div>
          <div className="review-items">
            {cartItems.map(({ product, quantity }) => (
              <div key={product.id}>
                <img src={product.image} alt="" />
                <span>
                  <b>{product.name[locale]}</b>
                  <small>
                    {l.quantity}: {quantity}
                  </small>
                </span>
                <strong>
                  <bdi>{formatDzd(product.price * quantity, locale)}</bdi>
                </strong>
              </div>
            ))}
          </div>
          <div className="review-total">
            <span>{l.total}</span>
            <strong>
              <bdi>{formatDzd(total, locale)}</bdi>
            </strong>
          </div>
          <label className="consent-control">
            <input
              type="checkbox"
              checked={checkout.consent}
              onChange={(event) =>
                setCheckout((current) => ({ ...current, consent: event.target.checked }))
              }
            />
            <span>{l.contractConsent}</span>
          </label>
          <div className="checkout-actions">
            <button
              disabled={!checkout.consent}
              className="button-primary button-large"
              onClick={() => onPlaceOrder(total)}
            >
              {l.placeOrder}
              <DirectionalArrow locale={locale} />
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function ConfirmationPage({ locale, checkout, onNavigate }) {
  const l = labels[locale];
  const reference = checkout.orderReference ?? checkoutSeed.orderReference;
  return (
    <div className="checkout-shell confirmation-page">
      <section className="confirmation-card">
        <div className="confirmation-icon">
          <CheckCircle aria-hidden="true" size={64} weight="fill" />
        </div>
        <p className="page-kicker">atlas dz</p>
        <h1>{l.confirmationTitle}</h1>
        <p>{l.confirmationBody}</p>
        <div className="order-reference">
          <span>{l.orderReference}</span>
          <b>
            <bdi>{reference}</bdi>
          </b>
        </div>
        <div className="confirmation-actions">
          <button
            className="button-primary button-large"
            onClick={() => onNavigate(`/account/orders/${reference}`)}
          >
            {l.trackOrder}
            <DirectionalArrow locale={locale} />
          </button>
          <button className="button-secondary button-large" onClick={() => onNavigate('/')}>
            {l.keepShopping}
          </button>
        </div>
      </section>
    </div>
  );
}

function OrdersPage({ locale, checkout, onNavigate }) {
  const l = labels[locale];
  const placedOrder = checkout.orderReference
    ? {
        id: checkout.orderReference,
        reference: checkout.orderReference,
        placedAt: checkout.placedAt,
        status: { fr: 'Confirmée', ar: 'مؤكد' },
        total: checkout.total,
        itemCount: checkout.itemCount,
        image: checkout.image,
        timeline: checkoutSeed.timeline,
      }
    : null;
  const visibleOrders = [placedOrder, ...orders].filter(Boolean);
  return (
    <div className="page-shell">
      <Breadcrumbs locale={locale} items={[{ label: l.ordersTitle }]} onNavigate={onNavigate} />
      <header className="page-heading">
        <h1>{l.ordersTitle}</h1>
        <p>{l.ordersBody}</p>
      </header>
      <div className="orders-list">
        {visibleOrders.map((order) => (
          <article className="order-card" key={order.id}>
            <div className="order-card__image">
              <img src={order.image} alt="" />
            </div>
            <div>
              <span className="status-badge">{order.status[locale]}</span>
              <h2>
                <bdi>{order.reference}</bdi>
              </h2>
              <p>
                {l.orderedOn} {order.placedAt}
              </p>
              <p>
                {order.itemCount} {locale === 'ar' ? 'منتجات' : 'articles'}
              </p>
            </div>
            <strong>
              <bdi>{formatDzd(order.total, locale)}</bdi>
            </strong>
            <button
              className="button-secondary"
              onClick={() => onNavigate(`/account/orders/${order.id}`)}
            >
              {l.orderDetails}
              <DirectionalArrow locale={locale} />
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}

function OrderDetailPage({ locale, orderId, checkout, onNavigate }) {
  const l = labels[locale];
  const order =
    checkout.orderReference === orderId
      ? {
          id: checkout.orderReference,
          reference: checkout.orderReference,
          placedAt: checkout.placedAt,
          status: { fr: 'Confirmée', ar: 'مؤكد' },
          total: checkout.total,
          itemCount: checkout.itemCount,
          image: checkout.image,
          timeline: checkoutSeed.timeline,
        }
      : orders.find((candidate) => candidate.id === orderId);
  if (!order) return <NotFoundPage locale={locale} onNavigate={onNavigate} />;
  const timeline = order.timeline ?? checkoutSeed.timeline;
  const currentIndex = Math.max(
    0,
    timeline.reduce((latest, event, index) => (event.complete ? index : latest), -1),
  );
  return (
    <div className="page-shell">
      <Breadcrumbs
        locale={locale}
        items={[{ label: l.ordersTitle, path: '/account/orders' }, { label: order.reference }]}
        onNavigate={onNavigate}
      />
      <header className="order-detail-heading">
        <div>
          <span className="status-badge">{order.status[locale]}</span>
          <h1>
            <bdi>{order.reference}</bdi>
          </h1>
          <p>
            {l.orderedOn} {order.placedAt}
          </p>
        </div>
        <strong>
          <bdi>{formatDzd(order.total, locale)}</bdi>
        </strong>
      </header>
      <div className="order-detail-layout">
        <section className="tracking-card">
          <h2>{l.timeline}</h2>
          <ol>
            {timeline.map((event, index) => (
              <li
                className={
                  index === currentIndex
                    ? 'is-current'
                    : event.complete
                      ? 'is-complete'
                      : 'is-upcoming'
                }
                key={event.label.fr}
              >
                <span>
                  {index === 0 && event.complete ? (
                    <Package size={18} weight="fill" />
                  ) : event.complete ? (
                    <Check size={16} weight="bold" />
                  ) : (
                    <Clock size={16} weight="bold" />
                  )}
                </span>
                <div>
                  <b>{event.label[locale]}</b>
                  <small>{event.at[locale]}</small>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <aside className="support-card">
          <HeadsetIcon />
          <h2>{l.help}</h2>
          <p>{l.helpBody}</p>
          <button className="button-secondary" onClick={() => onNavigate('/help')}>
            {locale === 'ar' ? 'فتح مركز المساعدة' : 'Ouvrir le centre d’aide'}
          </button>
        </aside>
      </div>
    </div>
  );
}

function HeadsetIcon() {
  return (
    <div className="support-icon">
      <ShieldCheck aria-hidden="true" size={30} weight="duotone" />
    </div>
  );
}

function AccountPage({ locale, onNavigate }) {
  const l = labels[locale];
  return (
    <div className="page-shell">
      <Breadcrumbs
        locale={locale}
        items={[{ label: locale === 'ar' ? 'الحساب' : 'Compte' }]}
        onNavigate={onNavigate}
      />
      <header className="page-heading">
        <h1>{l.accountTitle}</h1>
        <p>{l.accountBody}</p>
      </header>
      <div className="account-grid">
        <button onClick={() => onNavigate('/account/orders')}>
          <Package size={28} weight="duotone" />
          <span>
            <b>{l.ordersTitle}</b>
            <small>{l.ordersBody}</small>
          </span>
          <DirectionalArrow locale={locale} />
        </button>
        <button onClick={() => onNavigate('/cart')}>
          <ShoppingCart size={28} weight="duotone" />
          <span>
            <b>{l.cartTitle}</b>
            <small>{l.priceNotice}</small>
          </span>
          <DirectionalArrow locale={locale} />
        </button>
        <button onClick={() => onNavigate('/help')}>
          <ShieldCheck size={28} weight="duotone" />
          <span>
            <b>{l.help}</b>
            <small>{l.helpBody}</small>
          </span>
          <DirectionalArrow locale={locale} />
        </button>
      </div>
    </div>
  );
}

function StaticPage({ locale, type, onNavigate }) {
  const content = {
    help: {
      fr: [
        'Centre d’aide',
        'Livraison, commandes et retours',
        'Cette expérience de démonstration présente les parcours principaux. Les canaux d’assistance réels seront activés seulement après configuration approuvée.',
      ],
      ar: [
        'مركز المساعدة',
        'التوصيل والطلبات والإرجاع',
        'تعرض هذه التجربة المسارات الأساسية. لن يتم تفعيل قنوات المساعدة الحقيقية إلا بعد اعتماد الإعدادات.',
      ],
    },
    privacy: {
      fr: [
        'Confidentialité',
        'Vos choix et vos données',
        'Aucune donnée personnelle réelle n’est utilisée dans cette démonstration. Les exemples visibles sont entièrement synthétiques.',
      ],
      ar: [
        'الخصوصية',
        'خياراتك وبياناتك',
        'لا تستخدم هذه التجربة أي بيانات شخصية حقيقية. كل الأمثلة المعروضة اصطناعية.',
      ],
    },
    returns: {
      fr: [
        'Retours',
        'Un suivi clair, article par article',
        'L’éligibilité dépendra de la catégorie, de l’état du produit et de la politique approuvée affichée au moment de l’achat.',
      ],
      ar: [
        'الإرجاع',
        'تتبع واضح لكل منتج',
        'تعتمد الأهلية على الفئة وحالة المنتج والسياسة المعتمدة المعروضة وقت الشراء.',
      ],
    },
  }[type];
  const [title, subtitle, body] = content[locale];
  return (
    <div className="page-shell">
      <Breadcrumbs locale={locale} items={[{ label: title }]} onNavigate={onNavigate} />
      <section className="static-hero">
        <p className="page-kicker">atlas dz</p>
        <h1>{title}</h1>
        <h2>{subtitle}</h2>
        <p>{body}</p>
        <button className="button-primary" onClick={() => onNavigate('/')}>
          {locale === 'ar' ? 'العودة إلى الصفحة الرئيسية' : 'Retour à l’accueil'}
        </button>
      </section>
    </div>
  );
}

function NotFoundPage({ locale, onNavigate }) {
  return (
    <div className="page-shell">
      <section className="flow-empty flow-empty--large">
        <Package aria-hidden="true" size={52} />
        <h1>{locale === 'ar' ? 'الصفحة غير موجودة' : 'Page introuvable'}</h1>
        <button className="button-primary" onClick={() => onNavigate('/')}>
          {locale === 'ar' ? 'العودة للرئيسية' : 'Retour à l’accueil'}
        </button>
      </section>
    </div>
  );
}

export function MarketplaceRoute({
  route,
  locale,
  location,
  cartItems,
  checkout,
  setCheckout,
  onNavigate,
  onAdd,
  onQuantity,
  onPlaceOrder,
}) {
  const { pathname } = route;
  if (pathname === '/search' || pathname.startsWith('/category/'))
    return <BrowsePage locale={locale} route={route} onNavigate={onNavigate} onAdd={onAdd} />;
  if (pathname.startsWith('/product/'))
    return (
      <ProductPage
        locale={locale}
        productId={decodeURIComponent(pathname.slice(9))}
        location={location}
        onNavigate={onNavigate}
        onAdd={onAdd}
      />
    );
  if (pathname === '/cart')
    return (
      <CartPage
        locale={locale}
        cartItems={cartItems}
        onNavigate={onNavigate}
        onQuantity={onQuantity}
      />
    );
  if (pathname.startsWith('/checkout/'))
    return (
      <CheckoutPage
        locale={locale}
        step={pathname.slice(10)}
        cartItems={cartItems}
        checkout={checkout}
        setCheckout={setCheckout}
        onNavigate={onNavigate}
        onPlaceOrder={onPlaceOrder}
      />
    );
  if (pathname === '/account') return <AccountPage locale={locale} onNavigate={onNavigate} />;
  if (pathname === '/account/orders')
    return <OrdersPage locale={locale} checkout={checkout} onNavigate={onNavigate} />;
  if (pathname.startsWith('/account/orders/'))
    return (
      <OrderDetailPage
        locale={locale}
        orderId={decodeURIComponent(pathname.slice(16))}
        checkout={checkout}
        onNavigate={onNavigate}
      />
    );
  if (pathname === '/help')
    return <StaticPage locale={locale} type="help" onNavigate={onNavigate} />;
  if (pathname === '/privacy')
    return <StaticPage locale={locale} type="privacy" onNavigate={onNavigate} />;
  if (pathname === '/returns-policy')
    return <StaticPage locale={locale} type="returns" onNavigate={onNavigate} />;
  return <NotFoundPage locale={locale} onNavigate={onNavigate} />;
}
