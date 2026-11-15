'use server';
import {
  CreateSupportCaseInputSchema,
  SupportActionInputSchema,
  UuidSchema,
} from '@atlas/contracts';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { customerToken } from '@/lib/cart-api';
import { customerTrustedOrigin } from '@/lib/customer-security';
import { actSupport, createSupport } from '@/lib/orders-api';
import { localizedHref, resolveLocale } from '@/lib/i18n';
export async function supportAction(
  _state: { error?: boolean },
  form: FormData,
): Promise<{ error?: boolean }> {
  const h = await headers();
  if (!customerTrustedOrigin(process.env, h.get('origin'), h.get('host'))) return { error: true };
  const token = await customerToken();
  if (!token) return { error: true };
  let savedId: string;
  try {
    if (form.get('caseId')) {
      const id = UuidSchema.parse(form.get('caseId'));
      const input = SupportActionInputSchema.parse({
        requestId: form.get('requestId'),
        expectedVersion: Number(form.get('version')),
        action: form.get('action'),
        body: form.get('body'),
      });
      savedId = (await actSupport(token, id, input)).case.id;
    } else {
      const input = CreateSupportCaseInputSchema.parse({
        sellerOrderId: form.get('sellerOrderId'),
        category: form.get('category'),
        body: form.get('body'),
      });
      savedId = (await createSupport(token, input)).case.id;
    }
  } catch {
    return { error: true };
  }
  revalidatePath('/support');
  redirect(
    `${localizedHref('/support', resolveLocale(form.get('lang')))}&caseId=${savedId}`,
  );
}
