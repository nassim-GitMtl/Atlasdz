'use server';
import { SetSellerDeliveryRateInputSchema, UuidSchema } from '@atlas/contracts';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { SellerApiError, setDeliveryRate } from '@/lib/api';
import { accessToken } from '@/lib/session';
import { trustedMutationOrigin } from '@/lib/security';
import { moneyToMinor } from '@/lib/offer-input';
import type { ActionState } from '@/app/actions';
export interface DeliveryState extends ActionState {
  readonly saved?: boolean;
}
export async function saveDeliveryAction(
  _state: DeliveryState,
  form: FormData,
): Promise<DeliveryState> {
  const h = await headers();
  if (!trustedMutationOrigin(process.env, h.get('origin'), h.get('host'))) return { error: 'csrf' };
  const token = await accessToken();
  if (!token) return { error: 'unauthorized' };
  const id = UuidSchema.safeParse(form.get('destinationId'));
  const inherited = form.get('useWilayaRate') === 'yes';
  const enabled = !inherited && form.get('enabled') === 'yes';
  const input = SetSellerDeliveryRateInputSchema.safeParse({
    expectedVersion: Number(form.get('version')),
    enabled,
    shippingFeeMinor: enabled ? moneyToMinor(String(form.get('fee') ?? '')) : 0,
    codCollector: enabled ? form.get('collector') : 'SELLER',
    useWilayaRate: inherited,
  });
  if (!id.success || !input.success || form.get('confirm') !== 'yes') return { error: 'invalid' };
  try {
    await setDeliveryRate(token, id.data, input.data);
  } catch (error) {
    return { error: error instanceof SellerApiError ? error.code : 'unavailable' };
  }
  revalidatePath('/delivery');
  return { saved: true };
}
