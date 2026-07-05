/**
 * Idempotency — dedupe inbound webhook deliveries by provider message id so a
 * provider retry can't double-process (audit I-013, and the double-send /
 * non-atomic-cache issues in the Telegram/WhatsApp handlers).
 *
 * Uses the WhatsAppMessage.message_id (or a dedicated key) as the natural dedupe
 * key: if a row with that message_id already exists, skip. For non-message flows,
 * `seen()` checks a lightweight marker entity. Base44 SDK client is injected so
 * this stays testable and free of a hard import.
 */

export interface EntityLike {
  filter: (
    where: Record<string, unknown>,
    sort?: string,
    limit?: number,
  ) => Promise<unknown[]>;
}

/** True if a WhatsAppMessage with this provider message_id already exists. */
export async function alreadyProcessedMessage(
  messages: EntityLike,
  messageId: string | undefined | null,
): Promise<boolean> {
  if (!messageId) return false; // no id → can't dedupe; caller may still guard
  const existing = await messages.filter({ message_id: messageId }, "-created_date", 1);
  return existing.length > 0;
}

/**
 * Generic once-guard: run `fn` only if `key` hasn't been marked done. The marker
 * store is any entity with create + filter (e.g. a small ProcessedEvent entity).
 * Returns { ran, result }.
 */
export async function runOnce<T>(
  store: EntityLike & { create: (d: Record<string, unknown>) => Promise<unknown> },
  key: string,
  fn: () => Promise<T>,
): Promise<{ ran: boolean; result?: T }> {
  const seen = await store.filter({ dedupe_key: key }, "-created_date", 1);
  if (seen.length > 0) return { ran: false };
  const result = await fn();
  await store.create({ dedupe_key: key, processed_at: new Date().toISOString() });
  return { ran: true, result };
}
