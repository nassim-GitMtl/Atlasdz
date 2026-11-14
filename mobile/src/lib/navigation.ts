import { router } from 'expo-router';

import type { Actor } from './session';

/** Where to go once signed in: sellers to their workspace, customers back where they were. */
export function afterSignIn(actor: Actor) {
  if (actor === 'seller') {
    if (router.canDismiss()) router.dismissAll();
    router.replace('/dashboard');
  } else if (router.canGoBack()) router.back();
  else router.replace('/');
}
