'use client';
import { useActionState, useState } from 'react';
import type { SupportCase } from '@atlas/contracts';
import { supportAction } from '@/app/support/actions';
import { supportCopy } from '@/lib/support-copy';
import type { Locale } from '@/lib/i18n';
export function SupportForm({
  locale,
  item,
  sellerOrderId,
  requestId,
}: {
  readonly locale: Locale;
  readonly item?: SupportCase;
  readonly sellerOrderId?: string;
  readonly requestId: string;
}) {
  const [state, action, pending] = useActionState(supportAction, {});
  const [body, setBody] = useState('');
  const t = supportCopy[locale];
  return (
    <form action={action} className="order-form support-form">
      <input type="hidden" name="lang" value={locale} />
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="caseId" value={item?.id ?? ''} />
      <input type="hidden" name="version" value={item?.version ?? 0} />
      <input type="hidden" name="sellerOrderId" value={sellerOrderId ?? ''} />
      <label htmlFor="support-action">{item ? t.action : t.category}</label>
      <select id="support-action" name={item ? 'action' : 'category'} required>
        {(item
          ? item.status === 'RESOLVED'
            ? (['REPLY'] as const)
            : (['REPLY', 'ESCALATE', 'CONFIRM_RESOLUTION'] as const)
          : (['RETURN_REQUEST', 'DELIVERY_ISSUE', 'OTHER'] as const)
        ).map((key) => (
          <option key={key} value={key}>
            {t[key]}
          </option>
        ))}
      </select>
      <label htmlFor="support-body">{t.body}</label>
      <textarea
        id="support-body"
        name="body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        minLength={5}
        maxLength={2000}
        required
        rows={5}
        dir="auto"
      />
      <button className="button button--primary" disabled={pending} type="submit">
        {pending ? t.busy : t.send}
      </button>
      {state.error && <p role="alert">{t.error}</p>}
    </form>
  );
}
