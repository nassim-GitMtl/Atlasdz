'use client';
import { useEffect } from 'react';
import { RECENT_KEY, remember } from '@/lib/device-lists';

/** Records a product page visit on this device (shown on the favorites page). */
export function RememberViewed({ slug }: { readonly slug: string }) {
  useEffect(() => remember(RECENT_KEY, slug, 20), [slug]);
  return null;
}
