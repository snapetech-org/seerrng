import { JSDOM } from 'jsdom';
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import useDialogFocus from './useDialogFocus';

let dom: JSDOM;
let root: Root;
const Dialog = ({ name, close }: { name: string; close: () => void }) => {
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref, true, close);
  return (
    <div ref={ref} role="dialog" aria-modal="true">
      <button>{name} first</button>
      <button>{name} last</button>
    </div>
  );
};

beforeEach(() => {
  dom = new JSDOM('<button id="trigger">Open</button><div id="root"></div>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
    queueMicrotask(callback);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  vi.spyOn(dom.window.HTMLElement.prototype, 'getClientRects').mockReturnValue([
    {},
  ] as unknown as DOMRectList);
  root = createRoot(document.getElementById('root')!);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.restoreAllMocks();
  dom.window.close();
  vi.unstubAllGlobals();
});

test('Escape dismisses only the topmost dialog and returns focus on close', async () => {
  const outer = vi.fn(),
    inner = vi.fn();
  document.getElementById('trigger')!.focus();
  await act(async () => root.render(<Dialog name="outer" close={outer} />));
  const outerFirst = document.activeElement;
  await act(async () =>
    root.render(
      <>
        <Dialog name="outer" close={outer} />
        <Dialog name="inner" close={inner} />
      </>
    )
  );
  document.dispatchEvent(
    new dom.window.KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
  );
  expect(inner).toHaveBeenCalledOnce();
  expect(outer).not.toHaveBeenCalled();
  await act(async () => root.render(<Dialog name="outer" close={outer} />));
  expect(document.activeElement).toBe(outerFirst);
});

test('Tab wraps within the dialog and a handled Escape stays with its child control', async () => {
  const close = vi.fn();
  await act(async () => root.render(<Dialog name="current" close={close} />));
  const buttons = document.querySelectorAll<HTMLButtonElement>(
    '[role="dialog"] button'
  );
  buttons[1].focus();
  document.dispatchEvent(
    new dom.window.KeyboardEvent('keydown', { key: 'Tab', cancelable: true })
  );
  expect(document.activeElement).toBe(buttons[0]);
  document.dispatchEvent(
    new dom.window.KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      cancelable: true,
    })
  );
  expect(document.activeElement).toBe(buttons[1]);
  const handled = new dom.window.KeyboardEvent('keydown', {
    key: 'Escape',
    cancelable: true,
  });
  handled.preventDefault();
  document.dispatchEvent(handled);
  expect(close).not.toHaveBeenCalled();
});
