/**
 * Base44 SDK client — v2.
 *
 * Fix vs legacy (audit I-114): `requiresAuth: true`. The legacy client used
 * `requiresAuth: false` and leaned on an out-of-band `me()` in an AuthContext,
 * so components that rendered before the gate could fire unauthenticated entity
 * calls. v2 requires auth at the client so the SDK short-circuits until a session
 * exists.
 */
import { createClient } from '@base44/sdk';

export const base44 = createClient({
  appId: import.meta.env.VITE_BASE44_APP_ID,
  requiresAuth: true,
});
