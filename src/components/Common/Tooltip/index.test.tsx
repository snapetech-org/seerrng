import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

describe('SeerrNG tooltip keyboard references', () => {
  it('opens from keyboard focus and describes the focused reference', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'http://localhost',
    });
    for (const key of [
      'window',
      'document',
      'Element',
      'Node',
      'HTMLElement',
      'MutationObserver',
      'MouseEvent',
      'KeyboardEvent',
      'getComputedStyle',
    ]) {
      vi.stubGlobal(
        key,
        key === 'window' ? dom.window : dom.window[key as keyof Window]
      );
    }
    vi.stubGlobal('React', React);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const { default: Tooltip } = await import('./index');

    const host = document.createElement('div');
    document.body.append(host);
    const root: Root = createRoot(host);

    try {
      await act(async () => {
        root.render(
          <Tooltip content="Series">
            <span aria-label="Series">Series</span>
          </Tooltip>
        );
      });

      const reference = host.querySelector('span');
      expect(reference).not.toBeNull();
      if (!reference) throw new Error('Tooltip reference was not rendered');

      await act(async () => {
        reference.focus();
      });

      const tooltip =
        document.body.querySelector<HTMLElement>('[role="tooltip"]');
      expect(tooltip).not.toBeNull();
      if (!tooltip) {
        throw new Error(
          `Tooltip did not open for the focused reference: ${reference.outerHTML}; body: ${document.body.innerHTML}`
        );
      }
      expect(tooltip.textContent).toBe('Series');
      expect(reference.getAttribute('aria-describedby')).toBe(tooltip.id);
    } finally {
      await act(async () => root.unmount());
      document.body.innerHTML = '';
      dom.window.close();
      vi.unstubAllGlobals();
    }
  });

  it('makes static tooltip content reachable and associates its description', async () => {
    const { default: Tooltip } = await import('./index');
    const markup = renderToStaticMarkup(
      <Tooltip content="Series">
        <span aria-label="Series">Series</span>
      </Tooltip>
    );

    expect(markup).toMatch(/<span[^>]*tabindex="0"/);
    expect(markup).toMatch(/data-app-tooltip-owned="true"/);
  });

  it('attaches a tooltip to the single focusable child inside a layout wrapper', async () => {
    const { default: Tooltip } = await import('./index');
    const markup = renderToStaticMarkup(
      <Tooltip content="Save these settings">
        <span>
          <button type="button">Save</button>
        </span>
      </Tooltip>
    );

    expect(markup).toMatch(/<span><button[^>]*data-app-tooltip-owned="true"/);
    expect(markup).not.toMatch(/<span[^>]*tabindex="0"/);
  });

  it('provides a keyboard target for disabled actions without enabling them', async () => {
    const { default: Tooltip } = await import('./index');
    const markup = renderToStaticMarkup(
      <Tooltip content="No items are available">
        <button type="button" disabled>
          Add Item
        </button>
      </Tooltip>
    );

    expect(markup).toMatch(
      /<span[^>]*role="group"[^>]*tabindex="0"[^>]*aria-label="Add Item"/
    );
    expect(markup).toMatch(/<button[^>]*disabled=""/);
  });

  it('adds focus support to custom controls that lack a tab stop', async () => {
    const { default: Tooltip } = await import('./index');
    const markup = renderToStaticMarkup(
      <Tooltip content="Open details">
        {React.createElement(
          'div',
          { role: 'button', onClick: () => undefined },
          'Open details'
        )}
      </Tooltip>
    );

    expect(markup).toMatch(/<div[^>]*role="button"[^>]*tabindex="0"/);
  });

  it('leaves empty tooltips and their children untouched', async () => {
    const { default: Tooltip } = await import('./index');
    const markup = renderToStaticMarkup(
      <Tooltip content="">
        <span>Optional detail</span>
      </Tooltip>
    );

    expect(markup).toBe('<span>Optional detail</span>');
  });
});
