import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import UpstreamRequestControl from './UpstreamRequestControl';
vi.mock('@app/components/Common/Tooltip', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
afterEach(() => vi.unstubAllGlobals());
it('selects an enabled format without invoking the disabled action, and keeps an all-disabled primary inert', async () => {
  const dom = new JSDOM('<div id="root"></div>');
  const globals = {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    Node: dom.window.Node,
    MutationObserver: dom.window.MutationObserver,
  };
  for (const [name, value] of Object.entries(globals))
    vi.stubGlobal(name, value);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('React', React);
  const container = document.getElementById('root')!;
  const root = createRoot(container);
  const hd = vi.fn();
  const fourK = vi.fn();
  const options = [
    { id: 'hd', label: 'HD', disabled: true, onClick: hd },
    { id: '4k', label: '4K', onClick: fourK },
  ];
  try {
    await act(async () =>
      root.render(
        <UpstreamRequestControl
          options={options}
          label="Request"
          icon={<svg />}
        />
      )
    );
    await act(async () =>
      (
        container.querySelector(
          '[data-testid="format-request-option-4k"]'
        ) as HTMLButtonElement
      ).click()
    );
    expect(fourK).toHaveBeenCalledOnce();
    expect(hd).not.toHaveBeenCalled();
    await act(async () =>
      root.render(
        <UpstreamRequestControl
          options={options.map((o) => ({ ...o, disabled: true }))}
          label="Request"
          icon={<svg />}
        />
      )
    );
    const primary = container.querySelector(
      '[data-testid="format-request-option-hd"]'
    ) as HTMLButtonElement;
    expect(primary.disabled).toBe(true);
    await act(async () => primary.click());
    expect(hd).not.toHaveBeenCalled();
    expect(fourK).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});
