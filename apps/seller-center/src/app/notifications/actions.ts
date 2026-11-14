'use server';
import { NotificationReadInputSchema } from '@atlas/contracts';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { readNotification, SellerApiError } from '@/lib/api';
import { accessToken } from '@/lib/session';
import { trustedMutationOrigin } from '@/lib/security';
import type { ActionState } from '@/app/actions';

export async function readNotificationAction(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const h = await headers();
  if (!trustedMutationOrigin(process.env, h.get('origin'), h.get('host'))) return { error: 'csrf' };
  const token = await accessToken();
  if (!token) return { error: 'unauthorized' };
  const input = NotificationReadInputSchema.safeParse({
    sellerOrderId: form.get('sellerOrderId'),
    version: Number(form.get('version')),
  });
  if (!input.success) return { error: 'invalid' };
  try {
    await readNotification(token, input.data);
  } catch (error) {
    return { error: error instanceof SellerApiError ? error.code : 'unavailable' };
  }
  revalidatePath('/notifications');
  return {};
}
