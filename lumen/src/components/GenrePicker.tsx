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
  max,
  defaultOpen = false,
}: {
  options: GenreOption[];
  picked: string[];
  onChange: (next: string[]) => void;
  match?: { all: boolean; set: (all: boolean) => void };
  max?: number;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const phone = usePhone();
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const refocus = useRef(false);
  const [alignRight, setAlignRight] = useState(false);
  const text = genreSummary(picked, options);
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
    const b = btn.current?.getBoundingClientRect();
    if (box && b)
      setAlignRight(b.left + box.offsetWidth > window.innerWidth - 16);
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
        <h3>Genres</h3>
        {picked.length > 0 && (
          <span className="gp-count">{picked.length} picked</span>
        )}
      </div>
      {match && picked.length > 1 && (
        <div className="seg gp-match" role="group" aria-label="Genres to match">
          <button aria-pressed={!match.all} onClick={() => match.set(false)}>
            Match any
          </button>
          <button aria-pressed={match.all} onClick={() => match.set(true)}>
            Match all
          </button>
        </div>
      )}
      <div className="gp-list" role="group" aria-label="Genres">
        <Opt on={!picked.length} onClick={() => onChange([])} all>
          All genres
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
        aria-label={`Genres: ${text}`}
        onClick={() => (open ? close(false) : setOpen(true))}
      >
        <span className="gp-text">{text}</span>
      </button>
      {open && !phone && (
        <div
          ref={pop}
          className={`gp-pop ${alignRight ? 'right' : ''}`}
          role="dialog"
          aria-label="Genres"
        >
          {body}
        </div>
      )}
      {open && phone && (
        <GenreSheet onClose={() => close(true)}>{body}</GenreSheet>
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
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  useDialog(box, onClose);
  return createPortal(
    <div className="sheet-wrap open">
      <div className="sheet-scrim" onClick={onClose} />
      <div
        ref={box}
        className="sheet gp-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Genres"
      >
        <div className="grab" />
        <div className="gp-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}
