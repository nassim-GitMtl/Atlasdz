import { Redirect } from 'expo-router';

import { useSession } from '@/lib/session';

/**
 * Unknown links, and screens of the other mode (a seller opening the app on the shop's home,
 * signing out from a seller screen, a stale notification link), open the current mode's home.
 */
export default function NotFound() {
  const session = useSession();
  const seller = session.status === 'signedIn' && session.actor === 'seller';
  return <Redirect href={seller ? '/dashboard' : '/'} />;
}
