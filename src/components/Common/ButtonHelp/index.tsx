import {
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating,
  useInteractions,
  useRole,
} from '@floating-ui/react';
import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { useIntl } from 'react-intl';
import { findHelpButton, getButtonHelp } from './buttonHelp';

/** One listener layer covers shared/native actions and portal dialogs without
 * adding wrappers, changing button geometry, or taking over their click/ref. */
const ButtonHelp = () => {
  const intl = useIntl();
  const id = useId();
  const [active, setActive] = useState<{
    button: HTMLElement;
    text: string;
  } | null>(null);
  const { refs, floatingStyles, context } = useFloating({
    open: !!active,
    whileElementsMounted: autoUpdate,
    placement: 'top',
    middleware: [offset(10), flip({ padding: 8 }), shift({ padding: 8 })],
  });
  const role = useRole(context, { role: 'tooltip' });
  const { getFloatingProps } = useInteractions([role]);
  useEffect(() => {
    refs.setReference(active?.button ?? null);
  }, [active?.button, refs]);
  useEffect(() => {
    let button: HTMLElement | null = null;
    let dismissed: HTMLElement | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    let originalTitle: string | null = null;
    let observer: MutationObserver | undefined;
    const hide = () => {
      clearTimeout(timer);
      clearTimeout(hideTimer);
      observer?.disconnect();
      if (button) {
        const describedBy = (button.getAttribute('aria-describedby') ?? '')
          .split(/\s+/)
          .filter((value) => value && value !== id)
          .join(' ');
        if (describedBy) button.setAttribute('aria-describedby', describedBy);
        else button.removeAttribute('aria-describedby');
        if (originalTitle !== null && !button.hasAttribute('title'))
          button.setAttribute('title', originalTitle);
      }
      originalTitle = null;
      button = null;
      setActive(null);
    };
    const show = (target: EventTarget | null, immediate = false) => {
      clearTimeout(hideTimer);
      if (
        target instanceof Element &&
        target.closest('[data-button-help-popup]')
      )
        return;
      const next = findHelpButton(target);
      if (next === button) return;
      hide();
      if (!next || next === dismissed) return;
      const text = getButtonHelp(next, intl);
      if (!text) return;
      button = next;
      originalTitle = next.getAttribute('title');
      if (originalTitle !== null) next.removeAttribute('title');
      const reveal = () => {
        if (!next.isConnected) return hide();
        next.setAttribute(
          'aria-describedby',
          [
            ...new Set([
              ...(next.getAttribute('aria-describedby') ?? '')
                .split(/\s+/)
                .filter(Boolean),
              id,
            ]),
          ].join(' ')
        );
        setActive({ button: next, text });
        // Dismiss stale help if permission, loading, selection or route changes.
        observer = new MutationObserver(() => hide());
        observer.observe(next, {
          attributes: true,
          attributeFilter: [
            'disabled',
            'aria-disabled',
            'aria-expanded',
            'title',
            'data-button-help',
            'data-disabled-reason',
          ],
          childList: true,
          subtree: true,
          characterData: true,
        });
      };
      if (immediate) reveal();
      else timer = setTimeout(reveal, 250);
    };
    const over = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') show(event.target);
    };
    const out = (event: PointerEvent) => {
      if (
        event.relatedTarget instanceof Node &&
        (button?.contains(event.relatedTarget) ||
          (event.relatedTarget instanceof Element &&
            event.relatedTarget.closest('[data-button-help-popup]')))
      )
        return;
      dismissed = null;
      clearTimeout(hideTimer);
      hideTimer = setTimeout(hide, 100);
    };
    const focus = (event: FocusEvent) => show(event.target, true);
    const blur = (event: FocusEvent) => {
      if (
        !(event.relatedTarget instanceof Node) ||
        !button?.contains(event.relatedTarget)
      )
        hide();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        dismissed = button;
        hide();
      }
    };
    document.addEventListener('pointerover', over, true);
    document.addEventListener('pointerout', out, true);
    document.addEventListener('focusin', focus, true);
    document.addEventListener('focusout', blur, true);
    document.addEventListener('keydown', escape, true);
    document.addEventListener('click', hide, true);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      hide();
      document.removeEventListener('pointerover', over, true);
      document.removeEventListener('pointerout', out, true);
      document.removeEventListener('focusin', focus, true);
      document.removeEventListener('focusout', blur, true);
      document.removeEventListener('keydown', escape, true);
      document.removeEventListener('click', hide, true);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [id, intl]);
  return active
    ? createPortal(
        <div
          ref={refs.setFloating}
          style={floatingStyles}
          {...getFloatingProps({
            className: 'app-tooltip',
            role: 'tooltip',
          })}
          id={id}
          role="tooltip"
          data-button-help-popup=""
        >
          {active.text}
        </div>,
        document.body
      )
    : null;
};
export default ButtonHelp;
