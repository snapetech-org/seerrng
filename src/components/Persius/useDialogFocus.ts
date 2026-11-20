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
    const visibleDialogs = () =>
      Array.from(
        document.querySelectorAll<HTMLElement>('[aria-modal="true"]')
      ).filter(
        (dialog) =>
          !dialog.hidden &&
          dialog.getAttribute('aria-hidden') !== 'true' &&
          dialog.getClientRects().length > 0
      );
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
    let disposed = false;
    let frame = 0;
    const focusWhenMounted = () => {
      if (disposed) return;
      const dialog = ref.current;
      const dialogs = visibleDialogs();
      if (dialog && dialogs.at(-1) !== dialog) return;
      if (dialog?.contains(document.activeElement)) return;
      (focusable()[0] ?? dialog)?.focus();
      if (!dialog?.contains(document.activeElement)) {
        frame = requestAnimationFrame(focusWhenMounted);
      }
    };
    const onFocusIn = (event: FocusEvent) => {
      const dialog = ref.current;
      if (
        !dialog ||
        visibleDialogs().at(-1) !== dialog ||
        (event.target instanceof window.Node && dialog.contains(event.target))
      )
        return;
      focusable()[0]?.focus();
    };
    frame = requestAnimationFrame(focusWhenMounted);
    const observer = new window.MutationObserver(() => {
      const dialog = ref.current;
      if (
        dialog &&
        visibleDialogs().at(-1) === dialog &&
        !dialog.contains(document.activeElement)
      )
        (focusable()[0] ?? dialog)?.focus();
    });
    if (ref.current)
      observer.observe(ref.current, {
        attributes: true,
        attributeFilter: [
          'aria-hidden',
          'class',
          'disabled',
          'hidden',
          'style',
          'tabindex',
        ],
        childList: true,
        subtree: true,
      });
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const dialogs = visibleDialogs();
      if (dialogs.at(-1) !== ref.current) return;
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
    document.addEventListener('focusin', onFocusIn);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocusIn);
      if (previous?.isConnected) previous.focus();
    };
  }, [enabled, ref]);
}
