import { useEffect, useRef, type RefObject } from 'react';

/** Keep keyboard focus in the topmost dialog and return it to its trigger. */
export default function useDialogFocus(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
  onDismiss?: () => void
) {
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useEffect(() => {
    if (!enabled) return;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const focusable = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'a[href], button, input, select, textarea, [tabindex]'
        ) ?? []
      ).filter(
        (element) =>
          !element.matches(':disabled, [tabindex="-1"]') &&
          element.getClientRects().length > 0
      );
    const frame = requestAnimationFrame(() => focusable()[0]?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const dialogs = document.querySelectorAll('[aria-modal="true"]');
      if (dialogs[dialogs.length - 1] !== ref.current) return;
      if (event.key === 'Escape' && dismiss.current) {
        event.preventDefault();
        dismiss.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = focusable();
      const first = elements[0],
        last = elements.at(-1);
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKey);
      if (previous?.isConnected) previous.focus();
    };
  }, [enabled, ref]);
}
