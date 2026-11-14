'use server';
import { NotificationReadInputSchema } from '@atlas/contracts';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { customerToken } from '@/lib/cart-api';
import { customerTrustedOrigin } from '@/lib/customer-security';
import { readNotification } from '@/lib/orders-api';

export async function readNotificationAction(
  _state: { error?: boolean; saved?: boolean },
  form: FormData,
): Promise<{ error?: boolean; saved?: boolean }> {
  const h = await headers();
  if (!customerTrustedOrigin(process.env, h.get('origin'), h.get('host'))) return { error: true };
  const token = await customerToken();
  const input = NotificationReadInputSchema.safeParse({
    sellerOrderId: form.get('sellerOrderId'),
    version: Number(form.get('version')),
  });
  if (!token || !input.success) return { error: true };
  try {
    await readNotification(token, input.data);
  } catch {
    return { error: true };
  }
  revalidatePath('/notifications');
  return { saved: true };
}
