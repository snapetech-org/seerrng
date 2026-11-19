import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../icons';
import { useDialog } from './useDialog';

export type GenreOption = { value: string; label: string };

// phones get the bottom sheet; wider screens a popover under the button
const PHONE = '(max-width: 699px)';
const subscribePhone = (cb: () => void) => {
  const m = window.matchMedia(PHONE);
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
};
const usePhone = () =>
  useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE).matches);

// what the button says: "All genres", "Fantasy", "Fantasy + 2" (or "3 genres" while the
// names are still loading)
export function genreSummary(picked: string[], options: GenreOption[]) {
  if (!picked.length) return 'All genres';
  const names = picked.map((v) => options.find((o) => o.value === v)?.label);
  if (names.some((n) => !n))
    return `${picked.length} genre${picked.length > 1 ? 's' : ''}`;
  return names.length === 1 ? names[0]! : `${names[0]} + ${names.length - 1}`;
}

// One Genres button beside Sort: it opens the page's genres to tick (as many as wanted),
// All genres to clear them and, where the page has it, Match any / Match all. Every tick
// applies straight away.
export function GenrePicker({
  options,
  picked,
  onChange,
  match,
  exclusion,
  max,
  defaultOpen = false,
  labels,
}: {
  options: GenreOption[];
  picked: string[];
  onChange: (next: string[]) => void;
  match?: { all: boolean; set: (all: boolean) => void };
  exclusion?: { active: boolean; toggle: () => void };
  max?: number;
  defaultOpen?: boolean;
  labels?: { title: string; all: string };
}) {
  const [open, setOpen] = useState(defaultOpen);
  const phone = usePhone();
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const refocus = useRef(false);
  const [popoverOffset, setPopoverOffset] = useState(0);
  const title = labels?.title ?? 'Genres';
  const allLabel = labels?.all ?? 'All genres';
  const summary = picked.length ? genreSummary(picked, options) : allLabel;
  const text =
    exclusion?.active && picked.length ? `Exclude ${summary}` : summary;
  const close = (focusButton: boolean) => {
    refocus.current = focusButton;
    setOpen(false);
  };
  // focus goes back to the button once the popover or sheet is gone (the sheet's page is
  // inert until then)
  useEffect(() => {
    if (open || !refocus.current) return;
    refocus.current = false;
    btn.current?.focus({ preventScroll: true });
  }, [open]);
  // the popover: it opens on its first ticked genre and flips to the button's right edge
  // when it would run off the screen; Escape closes it (focus back on the button), and so
  // does a click or Tab anywhere else
  useLayoutEffect(() => {
    if (!open || phone) return;
    const box = pop.current;
    const position = () => {
      const anchor = wrap.current?.getBoundingClientRect();
      if (!box || !anchor) return;
      const maxLeft = window.innerWidth - 16 - box.offsetWidth;
      const preferred =
        anchor.left > maxLeft ? anchor.right - box.offsetWidth : anchor.left;
      setPopoverOffset(
        Math.max(16, Math.min(preferred, maxLeft)) - anchor.left
      );
    };
    position();
    window.addEventListener('resize', position);
    const observer = new ResizeObserver(position);
    if (wrap.current) observer.observe(wrap.current);
    if (box) observer.observe(box);
    (
      box?.querySelector<HTMLElement>('.gp-opt[aria-pressed="true"]') ||
      box?.querySelector<HTMLElement>('.gp-opt')
    )?.focus({ preventScroll: true });
    const shut = (focusButton: boolean) => {
      refocus.current = focusButton;
      setOpen(false);
    };
    const outside = (e: Event) => {
      if (!wrap.current?.contains(e.target as Node)) shut(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      shut(true);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', position);
      observer.disconnect();
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, phone]);

  const toggle = (v: string) =>
    onChange(
      picked.includes(v) ? picked.filter((x) => x !== v) : picked.concat(v)
    );
  const full = max !== undefined && picked.length >= max;
  const body = (
    <>
      <div className="gp-head">
        <h3>{title}</h3>
        {/* always in place: a line appearing after the first tick moved the list under the finger */}
        {
          <span className="gp-count" aria-hidden={!picked.length}>
            {picked.length ? `${picked.length} picked` : '\u00a0'}
          </span>
        }
      </div>
      {/* shown from the start (off until two genres are picked) so the list never shifts */}
      {match && (
        <div className="seg gp-match" role="group" aria-label="Genres to match">
          <button
            aria-pressed={!match.all}
            disabled={picked.length < 2}
            onClick={() => match.set(false)}
          >
            Match any
          </button>
          <button
            aria-pressed={match.all}
            disabled={picked.length < 2}
            onClick={() => match.set(true)}
          >
            Match all
          </button>
        </div>
      )}
      {exclusion && (
        <div className="toolbar">
          <button
            type="button"
            className="chip"
            aria-pressed={exclusion.active && !!picked.length}
            disabled={!picked.length}
            onClick={exclusion.toggle}
          >
            Exclude Selected Genres
          </button>
        </div>
      )}
      <div className="gp-list" role="group" aria-label={title}>
        <Opt on={!picked.length} onClick={() => onChange([])} all>
          {allLabel}
        </Opt>
        {options.map((o) => {
          const on = picked.includes(o.value);
          return (
            <Opt
              key={o.value}
              on={on}
              disabled={!on && full}
              onClick={() => toggle(o.value)}
            >
              {o.label}
            </Opt>
          );
        })}
      </div>
      <div className="gp-foot">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => close(true)}
        >
          Done
        </button>
      </div>
    </>
  );

  return (
    <div className="gp" ref={wrap}>
      <button
        ref={btn}
        type="button"
        className={`sel gp-btn ${picked.length ? 'on' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${title}: ${text}`}
        onClick={() => (open ? close(false) : setOpen(true))}
      >
        <span className="gp-text">{text}</span>
      </button>
      {open && !phone && (
        <div
          ref={pop}
          className="gp-pop"
          style={{ left: popoverOffset }}
          role="dialog"
          aria-label={title}
        >
          {body}
        </div>
      )}
      {open && phone && (
        <GenreSheet title={title} onClose={() => close(true)}>
          {body}
        </GenreSheet>
      )}
    </div>
  );
}

function Opt({
  on,
  all,
  disabled,
  onClick,
  children,
}: {
  on: boolean;
  all?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`gp-opt ${all ? 'gp-all' : ''}`}
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="gp-box" aria-hidden="true">
        {on && <Icon name="check" size="sm" />}
      </span>
      {children}
    </button>
  );
}

// the phone sheet: the same sheet the request dialogs use (focus kept inside, Escape and the
// scrim close it)
function GenreSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  useDialog(box, onClose);
  return createPortal(
    <div className="sheet-wrap open">
      <div className="sheet-scrim" aria-hidden="true" onClick={onClose} />
      <div
        ref={box}
        className="sheet gp-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="grab" />
        <div className="gp-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}
