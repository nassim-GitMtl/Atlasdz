import { lang, type Locale } from './i18n.ts';

export interface DeliveryDays {
  readonly min: number;
  readonly max: number;
}

const arDays = (n: number) => (n === 1 ? 'يوم واحد' : n === 2 ? 'يومان' : n <= 10 ? `${n} أيام` : `${n} يومًا`);

/** "2 à 4 jours" — the delivery time a seller states for a commune (after shipping). */
export function deliveryDaysLabel(days: DeliveryDays, locale: Locale): string {
  if (days.min === days.max)
    return lang(
      locale,
      `${days.min} jour${days.min > 1 ? 's' : ''}`,
      arDays(days.min),
      `${days.min} day${days.min > 1 ? 's' : ''}`,
    );
  return lang(
    locale,
    `${days.min} à ${days.max} jours`,
    `من ${days.min} إلى ${days.max} ${days.max <= 10 ? 'أيام' : 'يومًا'}`,
    `${days.min}–${days.max} days`,
  );
}

/** Shown under fee lists that include a stated delivery time. */
export const deliveryDaysNote = (locale: Locale) =>
  lang(
    locale,
    'Délais indiqués par chaque vendeur, comptés après l’expédition : ce n’est pas une garantie.',
    'المدد يذكرها كل بائع وتُحتسب بعد الشحن، وليست ضمانًا.',
    'Times are stated by each seller and counted from shipping; they are not a guarantee.',
  );
