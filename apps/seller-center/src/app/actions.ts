'use server';

import { AddSellerOrderNoteInputSchema, UuidSchema } from '@atlas/contracts';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  approveOffer,
  rejectOffer,
  replyToReview,
  createLocalSession,
  createOffer,
  updateOffer,
  getOffer,
  addOrderNote,
  answerQuestion,
  hideQuestion,
  resolveProductReports,
  revokeSellerSession,
  SellerApiError,
} from '@/lib/api';
import { href, localeFrom } from '@/lib/i18n';
import {
  parseOfferValues,
  parseOfferUpdate,
  emptyOfferValues,
  type OfferValues,
} from '@/lib/offer-input';
import { changedRows } from '@/lib/quick-edit';
import { importRows, parseCsv, type ImportProblem } from '@/lib/csv-import';
import { localAccountsEnabled, trustedMutationOrigin } from '@/lib/security';
import { accessToken, KIND_COOKIE, SESSION_COOKIE } from '@/lib/session';

export interface ActionState {
  readonly error?:
    | 'invalid'
    | 'unauthorized'
    | 'forbidden'
    | 'conflict'
    | 'unavailable'
    | 'csrf'
    | 'logoutFailure'
    | 'localDisabled';
  readonly values?: OfferValues;
}

async function validOrigin(): Promise<boolean> {
  const requestHeaders = await headers();
  return trustedMutationOrigin(
    process.env,
    requestHeaders.get('origin'),
    requestHeaders.get('host'),
  );
}

export async function loginAction(_state: ActionState, form: FormData): Promise<ActionState> {
  const requestHeaders = await headers();
  if (!localAccountsEnabled(process.env, requestHeaders.get('host')))
    return { error: 'localDisabled' };
  if (!(await validOrigin())) return { error: 'csrf' };
  const account = form.get('account');
  if (account !== 'seller' && account !== 'admin') return { error: 'invalid' };
  try {
    const session = await createLocalSession(account);
    const expiry = new Date(session.expiresAt);
    if (expiry.getTime() <= Date.now()) return { error: 'unauthorized' };
    const options = { httpOnly: true, secure: false, sameSite: 'strict', path: '/', expires: expiry } as const;
    const jar = await cookies();
    jar.set(SESSION_COOKIE, session.accessToken, options);
    jar.set(KIND_COOKIE, account === 'admin' ? 'staff' : 'seller', options);
  } catch (error) {
    return { error: error instanceof SellerApiError ? error.code : 'unavailable' };
  }
  redirect(
    href(account === 'admin' ? '/moderation' : '/offers', localeFrom(String(form.get('lang')))),
  );
}

export async function logoutAction(_state: ActionState, form: FormData): Promise<ActionState> {
  if (!(await validOrigin())) return { error: 'csrf' };
  const token = await accessToken();
  if (token) {
    try {
      await revokeSellerSession(token);
    } catch (error) {
      // Only a rejected credential proves the session is already unusable. A forbidden or
      // failed request must retain the cookie so the user can retry server-side revocation.
      if (!(error instanceof SellerApiError && error.code === 'unauthorized'))
        return { error: 'logoutFailure' };
    }
  }
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(KIND_COOKIE);
  redirect(href('/', localeFrom(String(form.get('lang')))));
}

export async function createOfferAction(_state: ActionState, form: FormData): Promise<ActionState> {
  const values = Object.fromEntries(
    Object.keys(emptyOfferValues).map((key) => [key, String(form.get(key) ?? '')]),
  ) as OfferValues;
  if (!(await validOrigin())) return { error: 'csrf', values };
  const token = await accessToken();
  if (!token) return { error: 'unauthorized', values };
  const parsed = parseOfferValues(values);
  if (!parsed.success) return { error: 'invalid', values };
  try {
    await createOffer(token, parsed.data);
  } catch (error) {
    return { error: error instanceof SellerApiError ? error.code : 'unavailable', values };
  }
  revalidatePath('/offers');
  redirect(`${href('/offers', localeFrom(String(form.get('lang'))))}&created=1`);
}

export async function approveOfferAction(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  if (!(await validOrigin())) return { error: 'csrf' };
  const token = await accessToken();
  if (!token) return { error: 'unauthorized' };
  const id = UuidSchema.safeParse(form.get('offerId'));
  if (!id.success) return { error: 'invalid' };
  try {
    await approveOffer(token, id.data);
  } catch (error) {
    return { error: error instanceof SellerApiError ? error.code : 'unavailable' };
  }
  revalidatePath('/moderation');
  redirect(`${href('/moderation', localeFrom(String(form.get('lang'))))}&approved=1`);
}

/** Staff refuses a pending offer with a reason the seller receives by email and sees. */
export async function rejectOfferAction(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  if (!(await validOrigin())) return { error: 'csrf' };
  const token = await accessToken();
  if (!token) return { error: 'unauthorized' };
  const id = UuidSchema.safeParse(form.get('offerId'));
  const reason = String(form.get('reason') ?? '').trim();
  if (!id.success || reason.length < 5 || reason.length > 300) return { error: 'invalid' };
  try {
    await rejectOffer(token, id.data, reason);
  } catch (error) {
    return { error: error instanceof SellerApiError ? error.code : 'unavailable' };
  }
  revalidatePath('/moderation');
  redirect(`${href('/moderation', localeFrom(String(form.get('lang'))))}&rejected=1`);
}

export async function updateOfferAction(_state: ActionState, form: FormData): Promise<ActionState> {
  const values = Object.fromEntries(
    Object.keys(emptyOfferValues).map((key) => [key, String(form.get(key) ?? '')]),
  ) as OfferValues;
  if (!(await validOrigin())) return { error: 'csrf', values };
  const token = await accessToken();
  if (!token) return { error: 'unauthorized', values };
  const id = UuidSchema.safeParse(form.get('offerId'));
  const input = parseOfferUpdate(values, String(form.get('version') ?? ''));
  if (!id.success || !input.success) return { error: 'invalid', values };
  try {
    await updateOffer(token, id.data, input.data);
  } catch (error) {
    return { error: error instanceof SellerApiError ? error.code : 'unavailable', values };
  }
  revalidatePath('/offers');
  revalidatePath(`/offers/${id.data}`);
  redirect(`${href('/offers', localeFrom(String(form.get('lang'))))}&updated=1`);
}

/** The seller answers a customer review publicly (once; a later reply replaces it). */
export async function replyReviewAction(_state: ActionState, form: FormData): Promise<ActionState> {
  if (!(await validOrigin())) return { error: 'csrf' };
  const token = await accessToken();
  if (!token) return { error: 'unauthorized' };
  const id = UuidSchema.safeParse(form.get('reviewId'));
  const body = String(form.get('body') ?? '').trim();
  const version = Number(form.get('version'));
  if (!id.success || body.length < 2 || body.length > 1000 || !Number.isInteger(version))
    return { error: 'invalid' };
  try {
    await replyToReview(token, id.data, body, version);
  } catch (error) {
    return { error: error instanceof SellerApiError ? error.code : 'unavailable' };
  }
  revalidatePath('/reviews');
  return {};
}

export interface QuickEditState {
  readonly error?: 'csrf' | 'unauthorized';
  /** Offers saved by the last submission. */
  readonly saved?: number;
  /** Offers not saved, with the reason (others were saved). */
  readonly failed?: readonly { readonly id: string; readonly reason: 'invalid' | 'conflict' | 'unavailable' }[];
}

/**
 * Saves the price and stock of every changed row. Delivery time and pre-order terms are sent
 * back unchanged and a running promotion is kept; a row edited elsewhere since the page was
 * loaded is refused (version check) instead of being overwritten.
 */
export async function quickUpdateOffersAction(
  _state: QuickEditState,
  form: FormData,
): Promise<QuickEditState> {
  if (!(await validOrigin())) return { error: 'csrf' };
  const token = await accessToken();
  if (!token) return { error: 'unauthorized' };
  const { rows, invalid } = changedRows(form);
  const failed: { id: string; reason: 'invalid' | 'conflict' | 'unavailable' }[] = invalid.map(
    (id) => ({ id, reason: 'invalid' as const }),
  );
  let saved = 0;
  for (const row of rows) {
    try {
      const current = await getOffer(token, row.id);
      if (current.rowVersion !== row.version) {
        failed.push({ id: row.id, reason: 'conflict' });
        continue;
      }
      await updateOffer(token, row.id, {
        priceMinor: row.priceMinor,
        availableQuantity: row.availableQuantity,
        handlingDays: current.handlingDays,
        preorder: current.preorder ?? null,
        expectedVersion: row.version,
      });
      saved += 1;
    } catch (error) {
      const code = error instanceof SellerApiError ? error.code : 'unavailable';
      failed.push({
        id: row.id,
        reason: code === 'conflict' ? 'conflict' : code === 'invalid' ? 'invalid' : 'unavailable',
      });
    }
  }
  if (saved > 0) {
    revalidatePath('/offers');
    revalidatePath('/offers/quick');
    revalidatePath('/dashboard');
  }
  return { saved, failed };
}

export interface NoteState {
  readonly error?: 'invalid' | 'csrf' | 'unauthorized' | 'forbidden' | 'unavailable';
  readonly done?: number;
}

/** Adds a private team note (call outcome or text) to one seller order. */
export async function addOrderNoteAction(state: NoteState, form: FormData): Promise<NoteState> {
  if (!(await validOrigin())) return { error: 'csrf' };
  const token = await accessToken();
  if (!token) return { error: 'unauthorized' };
  const id = UuidSchema.safeParse(form.get('sellerOrderId'));
  const body = String(form.get('body') ?? '').trim();
  const input = AddSellerOrderNoteInputSchema.safeParse({
    kind: form.get('kind'),
    ...(body ? { body } : {}),
  });
  if (!id.success || !input.success) return { error: 'invalid' };
  try {
    await addOrderNote(token, id.data, input.data);
  } catch (error) {
    const code = error instanceof SellerApiError ? error.code : 'unavailable';
    return { error: code === 'forbidden' || code === 'unauthorized' ? code : code === 'invalid' ? 'invalid' : 'unavailable' };
  }
  revalidatePath(`/orders/${id.data}`);
  return { done: (state.done ?? 0) + 1 };
}

export interface ImportState {
  readonly error?: 'file' | 'csrf' | 'unauthorized';
  readonly saved?: number;
  readonly unchanged?: number;
  readonly problems?: readonly {
    readonly line: number;
    readonly reason: ImportProblem['reason'] | 'unknown' | 'refused' | 'unavailable';
  }[];
}

/**
 * Applies the price and stock columns of an offers CSV (the export, edited in a spreadsheet).
 * Other columns are ignored; delivery time, pre-order and a running promotion are kept. Bad
 * lines are reported by line number and nothing is sent for them.
 */
export async function importOffersAction(_state: ImportState, form: FormData): Promise<ImportState> {
  if (!(await validOrigin())) return { error: 'csrf' };
  const token = await accessToken();
  if (!token) return { error: 'unauthorized' };
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0 || file.size > 1024 * 1024) return { error: 'file' };
  const { rows, problems } = importRows(parseCsv(await file.text()));
  const reported: NonNullable<ImportState['problems']>[number][] = [...problems];
  let saved = 0;
  let unchanged = 0;
  for (const row of rows) {
    try {
      const current = await getOffer(token, row.id).catch((error: unknown) => {
        if (error instanceof SellerApiError && ['forbidden', 'conflict', 'invalid'].includes(error.code))
          return null;
        throw error;
      });
      if (current === null) {
        reported.push({ line: row.line, reason: 'unknown' });
        continue;
      }
      if (current.priceMinor === row.priceMinor && current.availableQuantity === row.availableQuantity) {
        unchanged += 1;
        continue;
      }
      await updateOffer(token, row.id, {
        priceMinor: row.priceMinor,
        availableQuantity: row.availableQuantity,
        handlingDays: current.handlingDays,
        preorder: current.preorder ?? null,
        expectedVersion: current.rowVersion,
      });
      saved += 1;
    } catch (error) {
      const code = error instanceof SellerApiError ? error.code : 'unavailable';
      reported.push({ line: row.line, reason: code === 'unavailable' || code === 'unauthorized' ? 'unavailable' : 'refused' });
    }
  }
  if (saved > 0) {
    revalidatePath('/offers');
    revalidatePath('/offers/quick');
    revalidatePath('/dashboard');
  }
  return { saved, unchanged, problems: reported.sort((a, b) => a.line - b.line) };
}

export interface QuestionAnswerState {
  readonly error?: 'invalid' | 'csrf' | 'unauthorized' | 'unavailable';
  readonly done?: boolean;
}

/** A seller answers (or corrects its answer to) a customer's question. */
export async function answerQuestionAction(
  _state: QuestionAnswerState,
  form: FormData,
): Promise<QuestionAnswerState> {
  if (!(await validOrigin())) return { error: 'csrf' };
  const token = await accessToken();
  if (!token) return { error: 'unauthorized' };
  const id = UuidSchema.safeParse(form.get('questionId'));
  const body = String(form.get('body') ?? '').trim();
  if (!id.success || body.length < 2 || body.length > 1000) return { error: 'invalid' };
  try {
    await answerQuestion(token, id.data, body);
  } catch {
    return { error: 'unavailable' };
  }
  revalidatePath('/questions');
  return { done: true };
}

/** Staff hide a customer question. */
/** Staff close a product's open reports: dismiss them, or remove the product from sale. */
export async function resolveReportsAction(
  _state: QuestionAnswerState,
  form: FormData,
): Promise<QuestionAnswerState> {
  if (!(await validOrigin())) return { error: 'csrf' };
  const token = await accessToken();
  if (!token) return { error: 'unauthorized' };
  const id = UuidSchema.safeParse(form.get('productId'));
  const action = form.get('action');
  if (!id.success || (action !== 'DISMISS' && action !== 'REMOVE_PRODUCT')) return { error: 'invalid' };
  try {
    await resolveProductReports(token, id.data, action);
  } catch {
    return { error: 'unavailable' };
  }
  revalidatePath('/admin/reports');
  return { done: true };
}

export async function hideQuestionAction(
  _state: QuestionAnswerState,
  form: FormData,
): Promise<QuestionAnswerState> {
  if (!(await validOrigin())) return { error: 'csrf' };
  const token = await accessToken();
  if (!token) return { error: 'unauthorized' };
  const id = UuidSchema.safeParse(form.get('questionId'));
  if (!id.success) return { error: 'invalid' };
  try {
    await hideQuestion(token, id.data);
  } catch {
    return { error: 'unavailable' };
  }
  revalidatePath('/admin/questions');
  return { done: true };
}
