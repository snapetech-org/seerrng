import { useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useDialog } from './useDialog';

// A small confirmation in the same sheet the request dialogs use, for actions that can't be
// taken back (cancel a request, decline one, wipe your settings).
export function ConfirmSheet({
  title,
  body,
  confirm,
  cancel = 'Keep it',
  busy,
  confirmDisabled,
  children,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  confirm: string;
  cancel?: string;
  busy?: boolean;
  confirmDisabled?: boolean;
  children?: ReactNode;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  useDialog(box, onClose);
  return createPortal(
    <div className="sheet-wrap open">
      <div className="sheet-scrim" aria-hidden="true" onClick={onClose} />
      <div
        ref={box}
        className="sheet"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="grab" />
        <div className="pk">
          <header>
            <h3>{title}</h3>
            <span className="sub">{body}</span>
          </header>
          {children}
          <div className="pk-foot">
            <button
              className="btn btn-primary"
              disabled={busy || confirmDisabled}
              onClick={onConfirm}
            >
              {confirm}
            </button>
            {/* focus starts here, not on the action that can't be undone */}
            <button
              className="btn btn-tonal"
              data-autofocus
              onClick={onClose}
              disabled={busy}
            >
              {cancel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
