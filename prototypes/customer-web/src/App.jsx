import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowCounterClockwise,
  ArrowRight,
  CaretDown,
  CheckCircle,
  CreditCard,
  Headset,
  MagnifyingGlass,
  MapPin,
  Package,
  ShieldCheck,
  ShoppingCart,
  Timer,
  Truck,
  UserCircle,
  WifiSlash,
  X,
} from '@phosphor-icons/react';
import {
  categories,
  checkoutSeed,
  homeCollections,
  products,
  savedAddresses,
  shippingMethods,
  wilayas,
} from './catalog.js';
import { copy } from './copy.js';
import { MarketplaceRoute, ProductTile } from './flow.jsx';

const popularSearches = {
  fr: ['smartphone 5G', 'machine à café', 'climatiseur'],
  ar: ['هاتف 5G', 'آلة قهوة', 'مكيف هواء'],
};

const storageKeys = {
  cart: 'atlas-demo-cart-v1',
  checkout: 'atlas-demo-checkout-v1',
  locale: 'atlas-demo-locale-v1',
  location: 'atlas-demo-location-v1',
};

const defaultCheckout = {
  addressId: savedAddresses[0]?.id ?? '',
  shippingId: shippingMethods[0]?.id ?? '',
  consent: false,
  orderReference: null,
};

function readStoredJson(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeStoredJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The prototype stays usable when storage is unavailable or full.
  }
}

function readStoredCart() {
  const stored = readStoredJson(storageKeys.cart, {});
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
  return Object.fromEntries(
    Object.entries(stored).flatMap(([productId, entry]) => {
      const baseProduct = products.find((product) => product.id === productId);
      if (!baseProduct) return [];
      if (typeof entry === 'number' && Number.isFinite(entry)) {
        return [[productId, { product: baseProduct, quantity: entry }]];
      }
      if (!entry || typeof entry !== 'object' || !Number.isFinite(entry.quantity)) return [];
      return [[productId, { product: entry.product ?? baseProduct, quantity: entry.quantity }]];
    }),
  );
}

function SearchBox({ locale, t, query, setQuery, announce, onSearch }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef(null);
  const options = useMemo(() => {
    const all = [
      ...popularSearches[locale],
      ...products.map((product) => product.name[locale]),
      ...categories.map((category) => category.label[locale]),
    ];
    const needle = query.trim().toLocaleLowerCase(locale === 'ar' ? 'ar' : 'fr');
    return [...new Set(all)]
      .filter((item) => !needle || item.toLocaleLowerCase().includes(needle))
      .slice(0, 6);
  }, [locale, query]);

  function choose(value) {
    setQuery(value);
    setOpen(false);
    setActive(-1);
    announce(locale === 'ar' ? `تم اختيار ${value}` : `${value} sélectionné`);
    onSearch(value);
    inputRef.current?.focus();
  }

  function onKeyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((current) => Math.min(current + 1, options.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (open && active >= 0 && options[active]) choose(options[active]);
      else onSearch(query);
    } else if (event.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  }

  return (
    <div className="search-shell" role="search">
      <MagnifyingGlass aria-hidden="true" size={22} weight="bold" />
      <input
        ref={inputRef}
        aria-autocomplete="list"
        aria-controls="search-suggestions"
        aria-expanded={open}
        aria-label={t.searchLabel}
        role="combobox"
        value={query}
        placeholder={t.searchPlaceholder}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
      />
      <button className="search-submit" aria-label={t.searchAction} onClick={() => onSearch(query)}>
        <MagnifyingGlass aria-hidden="true" size={24} weight="bold" />
      </button>
      {open && (
        <div
          className="search-popover"
          id="search-suggestions"
          role="listbox"
          aria-label={t.searchSuggestions}
        >
          {options.length ? (
            options.map((option, index) => (
              <button
                key={option}
                role="option"
                aria-selected={index === active}
                className={index === active ? 'is-active' : ''}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
              >
                <MagnifyingGlass aria-hidden="true" size={17} />
                <span>{option}</span>
              </button>
            ))
          ) : (
            <p>{t.noSuggestions}</p>
          )}
        </div>
      )}
    </div>
  );
}

function LocationDialog({ locale, t, open, onClose, onConfirm }) {
  const [wilayaIndex, setWilayaIndex] = useState(0);
  const [communeIndex, setCommuneIndex] = useState(0);
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const selectedWilaya = wilayas[wilayaIndex];

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="location-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-title"
      >
        <button
          ref={closeRef}
          className="icon-button dialog-close"
          onClick={onClose}
          aria-label={t.cancel}
        >
          <X aria-hidden="true" size={22} weight="bold" />
        </button>
        <div className="dialog-icon">
          <MapPin aria-hidden="true" size={30} weight="fill" />
        </div>
        <h2 id="location-title">{t.locationTitle}</h2>
        <p>{t.locationBody}</p>
        <div className="location-fields">
          <label>
            <span>{t.wilaya}</span>
            <select
              value={wilayaIndex}
              onChange={(event) => {
                setWilayaIndex(Number(event.target.value));
                setCommuneIndex(0);
              }}
            >
              {wilayas.map((wilaya, index) => (
                <option value={index} key={wilaya.id}>
                  {wilaya.name[locale]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t.commune}</span>
            <select
              value={communeIndex}
              onChange={(event) => setCommuneIndex(Number(event.target.value))}
            >
              {selectedWilaya.communes[locale].map((commune, index) => (
                <option value={index} key={commune}>
                  {commune}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="dialog-actions">
          <button className="button-secondary" onClick={onClose}>
            {t.cancel}
          </button>
          <button
            className="button-primary"
            onClick={() => onConfirm(selectedWilaya.communes[locale][communeIndex])}
          >
            {t.confirm}
          </button>
        </div>
      </section>
    </div>
  );
}

function MarketplaceHeader({
  locale,
  t,
  location,
  onLocation,
  onLocale,
  cartCount,
  query,
  setQuery,
  announce,
  onSearch,
  onNavigate,
}) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <a
          className="brand"
          href="/"
          onClick={(event) => {
            event.preventDefault();
            onNavigate('/');
          }}
          aria-label="atlas dz — accueil"
        >
          <img src="/assets/atlas-loop-mark.png" alt="" width="46" height="40" />
          <span>atlas dz</span>
        </a>
        <button
          className="location-control"
          onClick={onLocation}
          aria-label={`${t.changeDelivery}: ${location}`}
        >
          <MapPin aria-hidden="true" size={20} weight="fill" />
          <span>{location}</span>
          <CaretDown aria-hidden="true" size={15} weight="bold" />
        </button>
        <SearchBox
          locale={locale}
          t={t}
          query={query}
          setQuery={setQuery}
          announce={announce}
          onSearch={onSearch}
        />
        <nav
          className="header-actions"
          aria-label={locale === 'ar' ? 'اختصارات الحساب' : 'Raccourcis du compte'}
        >
          <button aria-label={t.orders} onClick={() => onNavigate('/account/orders')}>
            <Package aria-hidden="true" size={23} />
            <span>{t.orders}</span>
          </button>
          <button aria-label={t.account} onClick={() => onNavigate('/account')}>
            <UserCircle aria-hidden="true" size={24} />
            <span>{t.account}</span>
          </button>
          <button
            className="cart-action"
            onClick={() => onNavigate('/cart')}
            aria-label={`${t.cart}: ${cartCount}`}
          >
            <ShoppingCart aria-hidden="true" size={26} />
            <span className="cart-count" aria-hidden="true">
              {cartCount}
            </span>
          </button>
          <button className="locale-control" onClick={onLocale}>
            {t.language}
          </button>
        </nav>
      </div>
    </header>
  );
}

function CategoryRail({ locale, onNavigate }) {
  return (
    <nav
      className="category-rail"
      aria-label={locale === 'ar' ? 'فئات المنتجات' : 'Catégories de produits'}
    >
      {categories.map((category) => (
        <button key={category.id} onClick={() => onNavigate(`/category/${category.id}`)}>
          <img src={category.image} alt="" loading="eager" />
          <span>{category.label[locale]}</span>
        </button>
      ))}
    </nav>
  );
}

function UtilityCard({ variant, image, title, body, items }) {
  return (
    <article className={`utility-card utility-card--${variant}`}>
      <img src={image} alt="" />
      <div className="utility-copy">
        <h2>{title}</h2>
        <p>{body}</p>
      </div>
      <div className="utility-details">
        {items.map(({ icon: Icon, text }) => (
          <div key={text}>
            <Icon aria-hidden="true" size={23} weight="bold" />
            <span>{text}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

function Hero({ locale, t, onSearch }) {
  return (
    <section className="hero-layout" aria-labelledby="hero-title">
      <article className="hero-card">
        <img className="hero-image" src="/assets/hero-mobile-bazaar.png" alt="" />
        <div className="hero-copy">
          <p className="eyebrow">{t.heroKicker}</p>
          <h1 id="hero-title">
            <span>{t.heroTitleA}</span>
            <span>{t.heroTitleB}</span>
            <span>{t.heroTitleC}</span>
          </h1>
          <p>{t.heroBody}</p>
          <button
            className="hero-cta"
            onClick={() =>
              document.querySelector('#fast-deals')?.scrollIntoView({ behavior: 'smooth' })
            }
          >
            {t.start}
          </button>
          <div className="popular-searches" aria-label={t.suggested}>
            {popularSearches[locale].map((term) => (
              <button key={term} onClick={() => onSearch(term)}>
                <MagnifyingGlass aria-hidden="true" size={15} />
                {term}
              </button>
            ))}
          </div>
        </div>
      </article>
      <div className="utility-stack">
        <UtilityCard
          variant="delivery"
          image="/assets/delivery-clear.png"
          title={t.deliveryTitle}
          body={t.deliveryBody}
          items={[
            { icon: Truck, text: t.deliveryDate },
            { icon: MapPin, text: t.deliveryTracking },
          ]}
        />
        <UtilityCard
          variant="payment"
          image="/assets/payment-flexible.png"
          title={t.paymentTitle}
          body={t.paymentBody}
          items={[
            { icon: CreditCard, text: t.paymentCard },
            { icon: CheckCircle, text: t.paymentCod },
          ]}
        />
      </div>
    </section>
  );
}

function WhyPanel({ t }) {
  const points = [
    { icon: ShieldCheck, title: t.sellersTitle, body: t.sellersBody },
    { icon: Package, title: t.returnsTitle, body: t.returnsBody },
    { icon: Headset, title: t.helpTitle, body: t.helpBody },
  ];
  return (
    <aside className="why-panel" aria-labelledby="why-title">
      <h2 id="why-title">{t.whyTitle}</h2>
      {points.map(({ icon: Icon, title, body }) => (
        <div className="why-point" key={title}>
          <Icon aria-hidden="true" size={34} weight="duotone" />
          <div>
            <h3>{title}</h3>
            <p>{body}</p>
          </div>
        </div>
      ))}
    </aside>
  );
}

function LoadingState({ t }) {
  return (
    <section className="state-panel" aria-live="polite" aria-busy="true">
      <span className="loader" aria-hidden="true" />
      <h2>{t.loading}</h2>
      <div className="skeleton-row" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
    </section>
  );
}

function ContentState({ type, t, onRetry }) {
  const error = type === 'error';
  return (
    <section className="state-panel" role={error ? 'alert' : undefined}>
      {error ? (
        <WifiSlash aria-hidden="true" size={44} />
      ) : (
        <Package aria-hidden="true" size={44} />
      )}
      <h2>{error ? t.errorTitle : t.emptyTitle}</h2>
      <p>{error ? t.errorBody : t.emptyBody}</p>
      {error && (
        <button className="button-primary" onClick={onRetry}>
          <ArrowCounterClockwise aria-hidden="true" size={19} />
          {t.retry}
        </button>
      )}
    </section>
  );
}

export function App() {
  const [locale, setLocale] = useState(() =>
    window.localStorage.getItem(storageKeys.locale) === 'ar' ? 'ar' : 'fr',
  );
  const [query, setQuery] = useState('');
  const [route, setRoute] = useState(() => ({
    pathname: window.location.pathname,
    search: window.location.search,
  }));
  const [cart, setCart] = useState(readStoredCart);
  const [checkout, setCheckout] = useState(() => ({
    ...defaultCheckout,
    ...readStoredJson(storageKeys.checkout, {}),
  }));
  const [location, setLocation] = useState(
    () => window.localStorage.getItem(storageKeys.location) || copy[locale].delivery,
  );
  const [locationOpen, setLocationOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [online, setOnline] = useState(() => navigator.onLine);
  const requestedState = new URLSearchParams(window.location.search).get('state');
  const [viewState, setViewState] = useState(
    requestedState === 'error' || requestedState === 'empty' ? requestedState : 'loading',
  );
  const t = copy[locale];
  const cartItems = useMemo(
    () =>
      products.flatMap((product) =>
        cart[product.id]
          ? [
              {
                product: cart[product.id].product ?? product,
                quantity: cart[product.id].quantity,
              },
            ]
          : [],
      ),
    [cart],
  );
  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const navigate = useCallback((destination) => {
    const next = new URL(destination, window.location.origin);
    window.history.pushState({}, '', `${next.pathname}${next.search}`);
    setRoute({ pathname: next.pathname, search: next.search });
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale === 'ar' ? 'ar' : 'fr';
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
    document.title =
      locale === 'ar' ? 'atlas dz — سوق جزائري' : 'atlas dz — Marketplace algérienne';
  }, [locale, route.pathname]);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.locale, locale);
    window.localStorage.setItem(storageKeys.location, location);
    writeStoredJson(storageKeys.cart, cart);
    writeStoredJson(storageKeys.checkout, checkout);
  }, [cart, checkout, locale, location]);

  useEffect(() => {
    const onPopState = () =>
      setRoute({ pathname: window.location.pathname, search: window.location.search });
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (route.pathname === '/search') setQuery(new URLSearchParams(route.search).get('q') ?? '');
  }, [route]);

  useEffect(() => {
    if (viewState !== 'loading') return undefined;
    const timer = window.setTimeout(() => setViewState('content'), 520);
    return () => window.clearTimeout(timer);
  }, [viewState]);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(''), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function announce(message) {
    setNotice('');
    window.setTimeout(() => setNotice(message), 20);
  }

  function changeLocale() {
    const next = locale === 'fr' ? 'ar' : 'fr';
    setLocale(next);
    setLocation(copy[next].delivery);
  }

  function addProduct(product) {
    if (product.stock <= 0) {
      announce(t.unavailable);
      return;
    }
    setCart((current) => ({
      ...current,
      [product.id]: {
        product,
        quantity: (current[product.id]?.quantity ?? 0) + 1,
      },
    }));
    announce(`${product.name[locale]} — ${t.added}`);
  }

  function updateQuantity(productId, quantity) {
    setCart((current) => {
      if (quantity <= 0) {
        const next = { ...current };
        delete next[productId];
        return next;
      }
      return {
        ...current,
        [productId]: {
          ...current[productId],
          quantity: Math.min(quantity, 10),
        },
      };
    });
  }

  function search(term) {
    const normalized = term.trim();
    setQuery(normalized);
    navigate(normalized ? `/search?q=${encodeURIComponent(normalized)}` : '/search');
  }

  function placeOrder(total) {
    const orderReference = checkoutSeed.orderReference;
    setCheckout((current) => ({
      ...current,
      consent: false,
      orderReference,
      total,
      itemCount: cartCount,
      image: cartItems[0]?.product.image ?? products[0].image,
      placedAt: checkoutSeed.placedAt?.[locale] ?? checkoutSeed.placedAt ?? '05/10/2026',
    }));
    setCart({});
    navigate('/checkout/confirmation');
  }

  const home = route.pathname === '/';

  return (
    <div id="top" className="app-shell">
      <a className="skip-link" href="#main-content">
        {t.skip}
      </a>
      {!online && (
        <div className="offline-banner" role="status">
          <WifiSlash aria-hidden="true" size={19} />
          {t.offline}
        </div>
      )}
      <MarketplaceHeader
        locale={locale}
        t={t}
        location={location}
        onLocation={() => setLocationOpen(true)}
        onLocale={changeLocale}
        cartCount={cartCount}
        query={query}
        setQuery={setQuery}
        announce={announce}
        onSearch={search}
        onNavigate={navigate}
      />
      <main id="main-content">
        {home ? (
          <>
            <CategoryRail locale={locale} onNavigate={navigate} />
            <Hero locale={locale} t={t} onSearch={search} />
            {viewState === 'loading' && <LoadingState t={t} />}
            {(viewState === 'error' || viewState === 'empty') && (
              <ContentState type={viewState} t={t} onRetry={() => setViewState('loading')} />
            )}
            {viewState === 'content' && (
              <>
                <section className="deals-section" id="fast-deals" aria-labelledby="deals-title">
                  <div className="commerce-layout">
                    <div className="deals-main">
                      <div className="section-heading">
                        <div>
                          <h2 id="deals-title">{t.fastTitle}</h2>
                          <span className="deadline">
                            <Timer aria-hidden="true" size={19} weight="bold" />
                            {t.until}
                          </span>
                        </div>
                        <button className="text-link" onClick={() => navigate('/search')}>
                          {t.seeAll}
                          <ArrowRight aria-hidden="true" size={18} />
                        </button>
                      </div>
                      <div className="product-grid">
                        {products.slice(0, 4).map((product) => (
                          <ProductTile
                            key={product.id}
                            product={product}
                            locale={locale}
                            onNavigate={navigate}
                            onAdd={addProduct}
                          />
                        ))}
                      </div>
                    </div>
                    <WhyPanel t={t} />
                  </div>
                </section>
                <section className="home-section" aria-labelledby="home-title">
                  <div className="section-heading">
                    <h2 id="home-title">{t.homeTitle}</h2>
                    <button className="text-link" onClick={() => navigate('/category/home')}>
                      {t.seeAll}
                      <ArrowRight aria-hidden="true" size={18} />
                    </button>
                  </div>
                  <div className="home-grid">
                    {homeCollections.map((collection) => (
                      <button key={collection.id} onClick={() => navigate('/category/home')}>
                        <img src={collection.image} alt="" loading="lazy" />
                        <span>{collection.label[locale]}</span>
                      </button>
                    ))}
                  </div>
                </section>
              </>
            )}
          </>
        ) : (
          <MarketplaceRoute
            route={route}
            locale={locale}
            location={location}
            cartItems={cartItems}
            checkout={checkout}
            setCheckout={setCheckout}
            onNavigate={navigate}
            onAdd={addProduct}
            onQuantity={updateQuantity}
            onPlaceOrder={placeOrder}
          />
        )}
      </main>
      <footer>
        <span>atlas dz</span>
        <nav aria-label={locale === 'ar' ? 'روابط قانونية' : 'Liens légaux'}>
          <button onClick={() => navigate('/help')}>{locale === 'ar' ? 'مساعدة' : 'Aide'}</button>
          <button onClick={() => navigate('/returns-policy')}>
            {locale === 'ar' ? 'الإرجاع' : 'Retours'}
          </button>
          <button onClick={() => navigate('/privacy')}>
            {locale === 'ar' ? 'الخصوصية' : 'Confidentialité'}
          </button>
        </nav>
      </footer>
      <div className={`toast ${notice ? 'is-visible' : ''}`} role="status" aria-live="polite">
        <CheckCircle aria-hidden="true" size={21} weight="fill" />
        <span>{notice}</span>
      </div>
      <LocationDialog
        locale={locale}
        t={t}
        open={locationOpen}
        onClose={() => setLocationOpen(false)}
        onConfirm={(nextLocation) => {
          setLocation(nextLocation);
          setLocationOpen(false);
          announce(`${t.delivery}: ${nextLocation}`);
        }}
      />
    </div>
  );
}
