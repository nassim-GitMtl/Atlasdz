'use client';
import { ShareNetwork } from '@phosphor-icons/react';
import { useState } from 'react';
import { lang, type Locale } from '@/lib/i18n';

/** Shares the product page (phone share sheet), or copies its link where sharing is missing. */
export function ShareButton({ title, locale }: { readonly title: string; readonly locale: Locale }) {
  const [copied, setCopied] = useState(false);
  return (
    <>
      <button
        type="button"
        className="share-button"
        onClick={async () => {
          const url = window.location.href;
          try {
            if (navigator.share) await navigator.share({ title, url });
            else {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            }
          } catch {
            // Share sheet dismissed, or clipboard refused: nothing to do.
          }
        }}
      >
        <ShareNetwork aria-hidden="true" size={18} />
        {lang(locale, 'Partager', 'مشاركة', 'Share')}
      </button>
      {copied && (
        <span role="status" className="share-copied">
          {lang(locale, 'Lien copié.', 'تم نسخ الرابط.', 'Link copied.')}
        </span>
      )}
    </>
  );
}
