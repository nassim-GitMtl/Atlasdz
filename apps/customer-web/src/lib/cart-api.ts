import { cookies } from 'next/headers';

export {
  CartApiError,
  getCart,
  setCartItem,
  createCustomerSession,
  revokeCustomerSession,
} from './cart-client';

export const CUSTOMER_COOKIE = 'atlas_customer_session';
export const customerToken = async () => (await cookies()).get(CUSTOMER_COOKIE)?.value;
