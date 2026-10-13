import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { vi } from 'vitest';

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
      assert.ok(reference);

      await act(async () => {
        reference.focus();
      });

      const tooltip =
        document.body.querySelector<HTMLElement>('[role="tooltip"]');
      assert.ok(
        tooltip,
        `Tooltip did not open for the focused reference: ${reference.outerHTML}; body: ${document.body.innerHTML}`
      );
      assert.equal(tooltip.textContent, 'Series');
      assert.equal(reference.getAttribute('aria-describedby'), tooltip.id);
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

    assert.match(markup, /<span[^>]*tabindex="0"/);
    assert.match(markup, /data-app-tooltip-owned="true"/);
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

    assert.match(markup, /<span><button[^>]*data-app-tooltip-owned="true"/);
    assert.doesNotMatch(markup, /<span[^>]*tabindex="0"/);
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

    assert.match(
      markup,
      /<span[^>]*role="group"[^>]*tabindex="0"[^>]*aria-label="Add Item"/
    );
    assert.match(markup, /<button[^>]*disabled=""/);
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

    assert.match(markup, /<div[^>]*role="button"[^>]*tabindex="0"/);
  });

  it('leaves empty tooltips and their children untouched', async () => {
    const { default: Tooltip } = await import('./index');
    const markup = renderToStaticMarkup(
      <Tooltip content="">
        <span>Optional detail</span>
      </Tooltip>
    );

    assert.equal(markup, '<span>Optional detail</span>');
  });
});
