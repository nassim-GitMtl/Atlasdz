import type { MailMessage } from './mailer.js';

type Locale = 'fr' | 'ar' | 'en';

export function passwordResetMail(to: string, locale: Locale, link: string): MailMessage {
  if (locale === 'en')
    return {
      to,
      subject: 'Atlas DZ — Password reset',
      text: `Hello,\n\nA password reset was requested for your account. Open this link within 30 minutes:\n${link}\n\nIf you did not ask for this, ignore this message: your password has not changed.\n\nAtlas DZ`,
    };
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

export function guestAccountMail(to: string, locale: Locale, link: string): MailMessage {
  if (locale === 'en')
    return {
      to,
      subject: 'Atlas DZ — Your account is ready',
      text: `Hello,\n\nThank you for your order. We created your account with this email address so you can follow your orders.\nChoose your password with this link (valid for 7 days, single use):\n${link}\n\nIf you did not order anything, ignore this message.\n\nAtlas DZ`,
    };
  return locale === 'ar'
    ? {
        to,
        subject: 'أطلس دي زد — حسابك جاهز',
        text: `مرحبًا،\n\nشكرًا على طلبك. أنشأنا لك حسابًا بهذا البريد الإلكتروني لتتابع طلباتك.\nاختر كلمة المرور من هذا الرابط (صالح 7 أيام، ويُستعمل مرة واحدة):\n${link}\n\nإذا لم تطلب شيئًا، تجاهل هذه الرسالة.\n\nأطلس دي زد`,
      }
    : {
        to,
        subject: 'Atlas DZ — Votre compte est prêt',
        text: `Bonjour,\n\nMerci pour votre commande. Nous avons créé votre compte avec cette adresse pour que vous puissiez suivre vos commandes.\nChoisissez votre mot de passe avec ce lien (valable 7 jours, à usage unique) :\n${link}\n\nSi vous n’avez rien commandé, ignorez ce message.\n\nAtlas DZ`,
      };
}

export function sellerReviewedMail(
  to: string,
  locale: Locale,
  approved: boolean,
  storeName: string,
  reason: string | null,
): MailMessage {
  if (locale === 'en')
    return {
      to,
      subject: approved ? 'Atlas DZ — Your shop is approved' : 'Atlas DZ — Your shop application',
      text: approved
        ? `Hello,\n\nYour shop “${storeName}” is approved. You can now propose your products and publish your offers from the Seller Center.\n\nAtlas DZ`
        : `Hello,\n\nYour shop “${storeName}” was not approved.${reason ? `\nReason: ${reason}` : ''}\n\nAtlas DZ`,
    };
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
  if (locale === 'en')
    return {
      to,
      subject: 'Atlas DZ — New order',
      text: `Hello,\n\nYou received a new order (cash on delivery) of DZD ${totalDzd}.\nAccept or refuse it before ${deadline}:\n${link}\n\nAtlas DZ`,
    };
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

export function sellerOrderReminderMail(
  to: string,
  locale: Locale,
  link: string,
  totalDzd: string,
  deadline: string,
): MailMessage {
  if (locale === 'en')
    return {
      to,
      subject: 'Atlas DZ — Reminder: order waiting for you',
      text: `Hello,\n\nAn order of DZD ${totalDzd} is still waiting for your answer. After ${deadline} it is cancelled automatically and the customer is told:\n${link}\n\nAtlas DZ`,
    };
  return locale === 'ar'
    ? {
        to,
        subject: 'أطلس دي زد — تذكير: طلب في انتظار قبولك',
        text: `مرحبًا،\n\nطلب بقيمة ${totalDzd} دج لا يزال في انتظار قبولك. بعد ${deadline} يُلغى تلقائيًا ويُبلَّغ الزبون:\n${link}\n\nأطلس دي زد`,
      }
    : {
        to,
        subject: 'Atlas DZ — Rappel : commande à accepter',
        text: `Bonjour,\n\nUne commande de ${totalDzd} DA attend toujours votre réponse. Après le ${deadline}, elle sera annulée automatiquement et le client prévenu :\n${link}\n\nAtlas DZ`,
      };
}

export function sellerOrderCancelledMail(to: string, locale: Locale, link: string): MailMessage {
  if (locale === 'en')
    return {
      to,
      subject: 'Atlas DZ — Order cancelled by the customer',
      text: `Hello,\n\nThe customer cancelled this order: do not prepare or ship it.\n${link}\n\nAtlas DZ`,
    };
  return locale === 'ar'
    ? {
        to,
        subject: 'أطلس دي زد — ألغى الزبون طلبًا',
        text: `مرحبًا،\n\nألغى الزبون هذا الطلب. لا تحضّره ولا ترسله:\n${link}\n\nأطلس دي زد`,
      }
    : {
        to,
        subject: 'Atlas DZ — Commande annulée par le client',
        text: `Bonjour,\n\nLe client a annulé cette commande : ne la préparez pas et ne l’expédiez pas.\n${link}\n\nAtlas DZ`,
      };
}

export function verifyEmailMail(to: string, locale: Locale, link: string): MailMessage {
  if (locale === 'en')
    return {
      to,
      subject: 'Atlas DZ — Confirm your email address',
      text: `Hello,\n\nTo confirm your email address and be able to order, open this link within 24 hours:\n${link}\n\nAtlas DZ`,
    };
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
  if (locale === 'en')
    return {
      to,
      subject: 'Atlas DZ — Order received',
      text: `Hello,\n\nYour order (cash on delivery) of DZD ${totalDzd} is recorded.\nSellers: ${sellerNames.join(', ')}\nEach seller will confirm their part. Follow your order:\n${link}\n\nAtlas DZ`,
    };
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
  en: {
    ACCEPTED: 'accepted your order',
    SHIPPED: 'shipped your order',
    DELIVERY_REPORTED:
      'says your order was delivered. Confirm receipt on the website if you received it',
    DELIVERY_FAILED: 'reports a failed delivery',
    REJECTED: 'could not accept your order (nothing is owed)',
    EXPIRED: 'did not answer in time; the order is cancelled (nothing is owed)',
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
      : locale === 'en'
        ? `\nCarrier: ${shipment.carrier} — tracking: ${shipment.trackingReference}`
        : locale === 'ar'
        ? `\nالناقل: ${shipment.carrier} — مرجع التتبع: ${shipment.trackingReference}`
        : `\nTransporteur : ${shipment.carrier} — suivi : ${shipment.trackingReference}`;
  if (locale === 'en')
    return {
      to,
      subject: `Atlas DZ — Order update (${sellerName})`,
      text: `Hello,\n\nThe seller “${sellerName}” ${statusText.en[status]}.${tracking}\n${link}\n\nAtlas DZ`,
    };
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

/** Staff decision on a seller's offer: online, or refused with the reason to fix. */
export function offerDecisionMail(
  to: string,
  locale: Locale,
  link: string,
  title: string,
  reason: string | null,
): MailMessage {
  if (locale === 'en')
    return reason === null
      ? {
          to,
          subject: `Atlas DZ — Your offer is live: ${title}`,
          text: `Hello,\n\nYour offer “${title}” was approved: customers can see it.\n${link}\n\nAtlas DZ`,
        }
      : {
          to,
          subject: `Atlas DZ — Offer not approved: ${title}`,
          text: `Hello,\n\nYour offer “${title}” was not approved.\nReason: ${reason}\n\nEdit it and save it to send it back for review:\n${link}\n\nAtlas DZ`,
        };
  if (locale === 'ar')
    return reason === null
      ? {
          to,
          subject: `أطلس دي زد — عرضك منشور: ${title}`,
          text: `مرحبًا،\n\nتمت الموافقة على عرضك «${title}» وأصبح ظاهرًا للزبائن.\n${link}\n\nأطلس دي زد`,
        }
      : {
          to,
          subject: `أطلس دي زد — لم تتم الموافقة على عرضك: ${title}`,
          text: `مرحبًا،\n\nلم تتم الموافقة على عرضك «${title}».\nالسبب: ${reason}\n\nعدّل العرض وأعد حفظه لإرساله للمراجعة من جديد:\n${link}\n\nأطلس دي زد`,
        };
  return reason === null
    ? {
        to,
        subject: `Atlas DZ — Votre offre est en ligne : ${title}`,
        text: `Bonjour,\n\nVotre offre « ${title} » a été validée : elle est visible par les clients.\n${link}\n\nAtlas DZ`,
      }
    : {
        to,
        subject: `Atlas DZ — Offre non validée : ${title}`,
        text: `Bonjour,\n\nVotre offre « ${title} » n’a pas été validée.\nMotif : ${reason}\n\nModifiez-la puis enregistrez-la pour la renvoyer en validation :\n${link}\n\nAtlas DZ`,
      };
}
