import { randomUUID } from 'expo-crypto';

/** Idempotency key for API writes that require one (product submissions, support replies). */
export const newRequestId = () => randomUUID();
