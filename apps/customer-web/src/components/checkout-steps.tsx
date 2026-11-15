import type { Locale } from '@/lib/i18n';

const steps = {
  fr: ['Panier et livraison', 'Vérification', 'Commande envoyée aux vendeurs'],
  ar: ['السلة والتوصيل', 'المراجعة', 'إرسال الطلب إلى البائعين'],
} as const;

/** Where the shopper is in checkout: cart and delivery details, review, then placed. */
export function CheckoutSteps({ locale, current }: { readonly locale: Locale; readonly current: 0 | 1 }) {
  return (
    <ol className="checkout-progress" aria-label={locale === 'ar' ? 'مراحل الطلب' : 'Étapes de la commande'}>
      {steps[locale].map((label, index) => (
        <li key={label} aria-current={index === current ? 'step' : undefined} className={index < current ? 'is-done' : undefined}>
          <span aria-hidden="true">{index + 1}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}
