'use client';

/** Opens the browser print dialog (save as PDF or print on paper). */
export function PrintButton({ label }: { readonly label: string }) {
  return (
    <button type="button" className="button no-print" onClick={() => window.print()}>
      {label}
    </button>
  );
}
