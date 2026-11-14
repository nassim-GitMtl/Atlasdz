'use server';
import {
  RejectSellerOrderInputSchema,
  ProcessSellerOrderInputSchema,
  UuidSchema,
} from '@atlas/contracts';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { SellerApiError, rejectSellerOrder, processSellerOrder } from '@/lib/api';
import { accessToken } from '@/lib/session';
import { trustedMutationOrigin } from '@/lib/security';
import type { ActionState } from '@/app/actions';
export interface RejectState extends ActionState {
  readonly rejected?: boolean;
}
export async function rejectOrderAction(_state: RejectState, form: FormData): Promise<RejectState> {
  const h = await headers();
  if (!trustedMutationOrigin(process.env, h.get('origin'), h.get('host'))) return { error: 'csrf' };
  const token = await accessToken();
  if (!token) return { error: 'unauthorized' };
  const id = UuidSchema.safeParse(form.get('sellerOrderId'));
  const input = RejectSellerOrderInputSchema.safeParse({
    expectedVersion: Number(form.get('version')),
    reasonCode: form.get('reasonCode'),
  });
  if (!id.success || !input.success || form.get('confirm') !== 'yes') return { error: 'invalid' };
  try {
    await rejectSellerOrder(token, id.data, input.data.expectedVersion, input.data.reasonCode);
  } catch (error) {
    return { error: error instanceof SellerApiError ? error.code : 'unavailable' };
  }
  revalidatePath('/orders');
  revalidatePath(`/orders/${id.data}`);
  return { rejected: true };
}
export async function processOrderAction(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const h = await headers();
  if (!trustedMutationOrigin(process.env, h.get('origin'), h.get('host'))) return { error: 'csrf' };
  const token = await accessToken();
  if (!token) return { error: 'unauthorized' };
  const id = UuidSchema.safeParse(form.get('sellerOrderId'));
  const action = form.get('action');
  const input = ProcessSellerOrderInputSchema.safeParse({
    action,
    expectedVersion: Number(form.get('version')),
    ...(action === 'SHIP'
      ? {
          shipment: {
            // The API also refuses a method that does not match the order's data class.
            method: form.get('dataClass') === 'live' ? 'SELLER_ARRANGED' : 'SELLER_ARRANGED_TEST',
            carrier: form.get('carrier'),
            trackingReference: form.get('trackingReference'),
          },
        }
      : {}),
  });
  if (!id.success || !input.success || form.get('confirm') !== 'yes') return { error: 'invalid' };
  try {
    await processSellerOrder(token, id.data, input.data);
  } catch (error) {
    return { error: error instanceof SellerApiError ? error.code : 'unavailable' };
  }
  revalidatePath('/orders');
  revalidatePath(`/orders/${id.data}`);
  return {};
}
