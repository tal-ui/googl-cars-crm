/**
 * toast — the single user-feedback channel, replacing 130+ blocking `alert()`
 * calls (audit I-122) that were LTR-native modals in an RTL app.
 *
 * Thin wrapper over sonner (already a dependency in the legacy app). Centralizing
 * here means we can theme/position once (top-center, RTL) and swap the underlying
 * lib without touching call sites. Use `toast.success/error/info` for feedback and
 * `toast.confirm` for the few destructive confirmations that legacy did with
 * `window.confirm`.
 */
import { toast as sonner } from 'sonner';

export const toast = {
  success: (msg) => sonner.success(msg, { position: 'top-center' }),
  error: (msg) => sonner.error(msg, { position: 'top-center' }),
  info: (msg) => sonner(msg, { position: 'top-center' }),

  /**
   * Promise-based confirm to replace blocking window.confirm(). Renders an action
   * toast; resolves true/false.
   */
  confirm: (msg, { confirmLabel = 'אישור', cancelLabel = 'ביטול' } = {}) =>
    new Promise((resolve) => {
      const id = sonner(msg, {
        position: 'top-center',
        duration: Infinity,
        action: { label: confirmLabel, onClick: () => { sonner.dismiss(id); resolve(true); } },
        cancel: { label: cancelLabel, onClick: () => { sonner.dismiss(id); resolve(false); } },
        onDismiss: () => resolve(false),
      });
    }),
};
