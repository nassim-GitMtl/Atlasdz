import type { MailMessage } from './mailer.js';

type Locale = 'fr' | 'ar';

export function passwordResetMail(to: string, locale: Locale, link: string): MailMessage {
  return locale === 'ar'
    ? {
        to,
        subject: 'أطلس دي زد — إعادة تعيين كلمة المرور',
        text: `مرحبًا،\n\nطُلب إعادة تعيين كلمة مرور حسابك. افتح الرابط التالي خلال 30 دقيقة:\n${link}\n\nإذا لم تطلب ذلك، تجاهل هذه الرسالة؛ كلمة مرورك لم تتغير.\n\nأطلس دي زد`,
      }
    : {
        to,
        subject: 'Atlas DZ — Réinitialisation du mot de passe',
        text: `Bonjour,\n\nUne réinitialisation du mot de passe de votre compte a été demandée. Ouvrez ce lien dans les 30 minutes :\n${link}\n\nSi vous n’êtes pas à l’origine de cette demande, ignorez ce message : votre mot de passe n’a pas changé.\n\nAtlas DZ`,
      };
}

export function sellerReviewedMail(
  to: string,
  locale: Locale,
  approved: boolean,
  storeName: string,
  reason: string | null,
): MailMessage {
  if (locale === 'ar') {
    return {
      to,
      subject: approved ? 'أطلس دي زد — تمت الموافقة على متجرك' : 'أطلس دي زد — طلب المتجر',
      text: approved
        ? `مرحبًا،\n\nتمت الموافقة على متجر «${storeName}». يمكنك الآن اقتراح منتجاتك ونشر عروضك من فضاء البائع.\n\nأطلس دي زد`
        : `مرحبًا،\n\nلم تتم الموافقة على متجر «${storeName}».${reason ? `\nالسبب: ${reason}` : ''}\n\nأطلس دي زد`,
    };
  }
  return {
    to,
    subject: approved
      ? 'Atlas DZ — Votre boutique est validée'
      : 'Atlas DZ — Votre demande de boutique',
    text: approved
      ? `Bonjour,\n\nVotre boutique « ${storeName} » est validée. Vous pouvez maintenant proposer vos produits et publier vos offres depuis l’Espace vendeur.\n\nAtlas DZ`
      : `Bonjour,\n\nVotre boutique « ${storeName} » n’a pas été validée.${reason ? `\nMotif : ${reason}` : ''}\n\nAtlas DZ`,
  };
}

export function newSellerOrderMail(
  to: string,
  locale: Locale,
  link: string,
  totalDzd: string,
  deadline: string,
): MailMessage {
  return locale === 'ar'
    ? {
        to,
        subject: 'أطلس دي زد — طلب جديد',
        text: `مرحبًا،\n\nوصلك طلب جديد (الدفع عند الاستلام) بقيمة ${totalDzd} دج.\nيرجى قبوله أو رفضه قبل ${deadline}:\n${link}\n\nأطلس دي زد`,
      }
    : {
        to,
        subject: 'Atlas DZ — Nouvelle commande',
        text: `Bonjour,\n\nVous avez reçu une nouvelle commande (paiement à la livraison) de ${totalDzd} DA.\nAcceptez-la ou refusez-la avant le ${deadline} :\n${link}\n\nAtlas DZ`,
      };
}

export function verifyEmailMail(to: string, locale: Locale, link: string): MailMessage {
  return locale === 'ar'
    ? {
        to,
        subject: 'أطلس دي زد — تأكيد بريدك الإلكتروني',
        text: `مرحبًا،\n\nلتأكيد بريدك الإلكتروني وتفعيل الطلب، افتح هذا الرابط خلال 24 ساعة:\n${link}\n\nأطلس دي زد`,
      }
    : {
        to,
        subject: 'Atlas DZ — Confirmez votre adresse e-mail',
        text: `Bonjour,\n\nPour confirmer votre adresse e-mail et pouvoir commander, ouvrez ce lien dans les 24 heures :\n${link}\n\nAtlas DZ`,
      };
}

export function customerOrderPlacedMail(
  to: string,
  locale: Locale,
  link: string,
  totalDzd: string,
  sellerNames: readonly string[],
): MailMessage {
  return locale === 'ar'
    ? {
        to,
        subject: 'أطلس دي زد — تم تسجيل طلبك',
        text: `مرحبًا،\n\nتم تسجيل طلبك (الدفع عند الاستلام) بقيمة ${totalDzd} دج.\nالبائعون: ${sellerNames.join('، ')}\nسيؤكد كل بائع جزءه من الطلب. تابع طلبك:\n${link}\n\nأطلس دي زد`,
      }
    : {
        to,
        subject: 'Atlas DZ — Commande enregistrée',
        text: `Bonjour,\n\nVotre commande (paiement à la livraison) de ${totalDzd} DA est enregistrée.\nVendeurs : ${sellerNames.join(', ')}\nChaque vendeur va confirmer sa partie. Suivre la commande :\n${link}\n\nAtlas DZ`,
      };
}

const statusText = {
  fr: {
    ACCEPTED: 'a accepté votre commande',
    SHIPPED: 'a expédié votre commande',
    DELIVERY_REPORTED:
      'indique avoir livré votre commande. Confirmez la réception sur le site si vous l’avez reçue',
    DELIVERY_FAILED: 'signale un échec de livraison',
    REJECTED: 'n’a pas pu accepter votre commande (aucun paiement n’est dû)',
    EXPIRED: 'n’a pas répondu à temps ; la commande est annulée (aucun paiement n’est dû)',
  },
  ar: {
    ACCEPTED: 'قبل طلبك',
    SHIPPED: 'شحن طلبك',
    DELIVERY_REPORTED: 'يصرّح بأنه سلّم طلبك. أكّد الاستلام على الموقع إذا استلمته',
    DELIVERY_FAILED: 'يبلّغ عن تعذر التوصيل',
    REJECTED: 'لم يتمكن من قبول طلبك (لا يُستحق أي دفع)',
    EXPIRED: 'لم يرد في الوقت المحدد؛ أُلغي الطلب (لا يُستحق أي دفع)',
  },
} as const;
export type NotifiedStatus = keyof (typeof statusText)['fr'];
export const NOTIFIED_STATUSES = Object.keys(statusText.fr) as NotifiedStatus[];

export function customerOrderStatusMail(
  to: string,
  locale: Locale,
  status: NotifiedStatus,
  sellerName: string,
  link: string,
  shipment: { carrier: string; trackingReference: string } | null,
): MailMessage {
  const tracking =
    shipment === null
      ? ''
      : locale === 'ar'
        ? `\nالناقل: ${shipment.carrier} — مرجع التتبع: ${shipment.trackingReference}`
        : `\nTransporteur : ${shipment.carrier} — suivi : ${shipment.trackingReference}`;
  return locale === 'ar'
    ? {
        to,
        subject: `أطلس دي زد — تحديث الطلب (${sellerName})`,
        text: `مرحبًا،\n\nالبائع «${sellerName}» ${statusText.ar[status]}.${tracking}\n${link}\n\nأطلس دي زد`,
      }
    : {
        to,
        subject: `Atlas DZ — Mise à jour de commande (${sellerName})`,
        text: `Bonjour,\n\nLe vendeur « ${sellerName} » ${statusText.fr[status]}.${tracking}\n${link}\n\nAtlas DZ`,
      };
}
