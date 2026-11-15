'use server';
import { SupportActionInputSchema, UuidSchema } from '@atlas/contracts';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { accessToken } from '@/lib/session';
import { trustedMutationOrigin } from '@/lib/security';
import { actSupport } from '@/lib/api';
import { href, localeFrom } from '@/lib/i18n';
export async function supportAction(
  _state: { error?: boolean },
  form: FormData,
): Promise<{ error?: boolean }> {
  const h = await headers();
  if (!trustedMutationOrigin(process.env, h.get('origin'), h.get('host'))) return { error: true };
  const token = await accessToken();
  if (!token) return { error: true };
  const staff = form.get('staff') === '1';
  let savedId: string;
  try {
    const id = UuidSchema.parse(form.get('caseId'));
    const input = SupportActionInputSchema.parse({
      requestId: form.get('requestId'),
      expectedVersion: Number(form.get('version')),
      action: form.get('action'),
      body: form.get('body'),
    });
    savedId = (await actSupport(token, id, staff, input)).case.id;
  } catch {
    return { error: true };
  }
  revalidatePath('/support');
  redirect(
    `${href('/support', localeFrom(form.get('lang')))}${staff ? '&staff=1' : ''}&caseId=${savedId}`,
  );
}
