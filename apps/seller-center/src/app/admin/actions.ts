'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import {
  AdminApiError,
  closeCustomer,
  closeSeller,
  deleteReviewAdmin,
  removeOfferAdmin,
  removeProductAdmin,
  setOfferStatusAdmin,
  createCategory,
  moderateReview,
  removePhoto,
  setSellerStatus,
  updateCategory,
} from '@/lib/admin';
import { trustedMutationOrigin } from '@/lib/security';
import { accessToken } from '@/lib/session';

export interface AdminState {
  readonly error?: AdminApiError['code'] | 'csrf';
  readonly done?: boolean;
}
const str = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

async function run(work: (token: string) => Promise<unknown>): Promise<AdminState> {
  const h = await headers();
  if (!trustedMutationOrigin(process.env, h.get('origin'), h.get('host'))) return { error: 'csrf' };
  const token = await accessToken();
  if (!token) return { error: 'unauthorized' };
  try {
    await work(token);
  } catch (error) {
    return { error: error instanceof AdminApiError ? error.code : 'unavailable' };
  }
  // Detail pages live under /admin too.
  revalidatePath('/admin', 'layout');
  return { done: true };
}

export async function sellerStatusAction(_s: AdminState, form: FormData) {
  return run((token) =>
    setSellerStatus(
      token,
      str(form, 'sellerId'),
      str(form, 'status'),
      str(form, 'reason') || undefined,
    ),
  );
}
export async function createCategoryAction(_s: AdminState, form: FormData) {
  return run((token) =>
    createCategory(token, {
      slug: str(form, 'slug').toLowerCase(),
      titleFr: str(form, 'titleFr'),
      titleAr: str(form, 'titleAr'),
      titleEn: str(form, 'titleEn'),
    }),
  );
}
export async function updateCategoryAction(_s: AdminState, form: FormData) {
  return run((token) =>
    updateCategory(token, str(form, 'id'), {
      titleFr: str(form, 'titleFr'),
      titleAr: str(form, 'titleAr'),
      titleEn: str(form, 'titleEn'),
      status: str(form, 'status'),
      restrictionClass: str(form, 'restrictionClass'),
    }),
  );
}
/** Accepts a product ID or a shop URL containing it (product slugs are p-<id>). */
export async function removePhotoAction(_s: AdminState, form: FormData) {
  const id = UUID.exec(str(form, 'product').toLowerCase())?.[0];
  if (!id) return { error: 'invalid' } satisfies AdminState;
  return run((token) => removePhoto(token, id));
}

export async function moderateReviewAction(_s: AdminState, form: FormData) {
  const id = UUID.exec(str(form, 'reviewId').toLowerCase())?.[0];
  const expectedVersion = Number(str(form, 'version'));
  if (!id || !Number.isInteger(expectedVersion) || expectedVersion < 1)
    return { error: 'invalid' } satisfies AdminState;
  if (str(form, 'action') === 'PUBLISH')
    return run((token) => moderateReview(token, id, { action: 'PUBLISH', expectedVersion }));
  const reason = str(form, 'reason');
  if (reason.length < 3 || reason.length > 500) return { error: 'invalid' } satisfies AdminState;
  return run((token) => moderateReview(token, id, { action: 'HIDE', reason, expectedVersion }));
}

/** One staff action on an account or item, chosen by the form's `action` field. */
export async function accountAction(_s: AdminState, form: FormData): Promise<AdminState> {
  const id = str(form, 'id');
  if (!UUID.test(id) || form.get('confirm') !== 'yes') return { error: 'invalid' };
  switch (str(form, 'action')) {
    case 'close-seller':
      return run((token) => closeSeller(token, id));
    case 'suspend-offer':
      return run((token) => setOfferStatusAdmin(token, id, 'SUSPENDED'));
    case 'restore-offer':
      return run((token) => setOfferStatusAdmin(token, id, 'APPROVED'));
    case 'remove-offer':
      return run((token) => removeOfferAdmin(token, id));
    case 'remove-product':
      return run((token) => removeProductAdmin(token, id));
    case 'delete-review':
      return run((token) => deleteReviewAdmin(token, id));
    case 'close-customer':
      return run((token) => closeCustomer(token, id));
    default:
      return { error: 'invalid' };
  }
}
