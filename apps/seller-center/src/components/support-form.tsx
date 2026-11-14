'use client';
import { useActionState, useState } from 'react';
import type { SupportCase } from '@atlas/contracts';
import { supportAction } from '@/app/support/actions';
import { supportCopy } from '@/lib/support-copy';
import type { Locale } from '@/lib/i18n';
export function SupportForm({
  locale,
  item,
  staff,
  requestId,
}: {
  readonly locale: Locale;
  readonly item: SupportCase;
  readonly staff: boolean;
  readonly requestId: string;
}) {
  const [state, action, pending] = useActionState(supportAction, {});
  const [body, setBody] = useState('');
  const t = supportCopy[locale];
  return (
    <form action={action} className="offer-form support-form">
      <input type="hidden" name="lang" value={locale} />
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="caseId" value={item.id} />
      <input type="hidden" name="version" value={item.version} />
      <input type="hidden" name="staff" value={staff ? '1' : '0'} />
      <div className="field">
        <label htmlFor="support-action">{t.action}</label>
        <select id="support-action" name="action" required>
          {(staff ? (['REPLY', 'STAFF_RESOLVE'] as const) : (['REPLY'] as const)).map((key) => (
            <option key={key} value={key}>
              {t[key]}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
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
      </div>
      <button className="button" disabled={pending} type="submit">
        {pending ? t.busy : t.send}
      </button>
      {state.error && (
        <p role="alert" className="notice error">
          {t.error}
        </p>
      )}
    </form>
  );
}
