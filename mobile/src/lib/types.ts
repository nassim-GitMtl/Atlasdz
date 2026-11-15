import type { ProductSubmission } from '../../../packages/contracts/src/catalog';

// API shapes come straight from the shared contracts package (type-only: nothing is bundled),
// so the app and the API cannot drift apart silently.
export type {
  CatalogEntry,
  CatalogProduct,
  CatalogProductList,
  CatalogSeller,
  ProductSubmission,
  SellerOffer,
} from '../../../packages/contracts/src/catalog';
export type { CartLine, CustomerCart } from '../../../packages/contracts/src/cart';
export type {
  DeliveryDestination,
  SellerDeliveryRate,
} from '../../../packages/contracts/src/delivery';
export type {
  CheckoutQuote,
  CustomerOrder,
  DeliveryContact,
  SellerOrder,
} from '../../../packages/contracts/src/orders';
export type {
  NotificationPage,
  OrderNotification,
} from '../../../packages/contracts/src/notifications';
export type { SupportCase, SupportDetail } from '../../../packages/contracts/src/support';
export type {
  CatalogCategoryList,
  OfferPromotion,
  Preorder,
} from '../../../packages/contracts/src/catalog';
export type {
  OrderReviews,
  OwnReview,
  PublicReview,
  ReviewPage,
  ReviewSummary,
  SellerReview,
  SellerReviewPage,
} from '../../../packages/contracts/src/reviews';

export type CatalogCategory = ProductSubmission['category'];
export type Locale = 'fr' | 'ar';
export type Localized = { readonly fr: string; readonly ar: string };

export type LoginResult =
  | { status: 'AUTHENTICATED'; accessToken: string; expiresAt: string; actorType: string }
  | { status: 'MFA_REQUIRED' }
  | { status: 'INVALID_CREDENTIALS' }
  | { status: 'MFA_ENROLLMENT_REQUIRED'; secret: string; otpauthUri: string };

export interface Account {
  readonly email: string;
  readonly locale: Locale;
  readonly emailVerified: boolean;
}

export interface SellerAccount {
  readonly sellerId: string;
  readonly status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
}

export interface PhoneStatus {
  readonly required: boolean;
  readonly phone: string | null;
  readonly verified: boolean;
}

export interface CustomerSignal {
  readonly phoneVerified: boolean;
  /** False for guest orders until the buyer opens the emailed link. */
  readonly emailVerified?: boolean;
  readonly deliveryPhoneVerified: boolean;
  readonly deliveredOrders: number;
  readonly failedDeliveries: number;
  readonly cancelledOrders: number;
  readonly accountAgeDays: number;
}

export interface SessionSummary {
  readonly id: string;
  readonly deviceLabel: string | null;
  readonly issuedAt: string;
  readonly lastSeenAt: string | null;
  readonly current: boolean;
}
