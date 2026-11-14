import type { SellerOrder } from './types';

type Status = SellerOrder['status'];

/** Badge colour for a seller order's status. */
export function statusTone(status: Status): 'neutral' | 'good' | 'bad' | 'wait' {
  if (status === 'DELIVERED') return 'good';
  if (['REJECTED', 'CANCELLED', 'EXPIRED', 'DELIVERY_FAILED'].includes(status)) return 'bad';
  if (status === 'AWAITING_SELLER') return 'wait';
  return 'neutral';
}

/** What the customer may do now (mirrors the shop website and the API's rules). */
export const canCancel = (status: Status) => status === 'AWAITING_SELLER';
export const canConfirmReceipt = (status: Status) => status === 'DELIVERY_REPORTED';
