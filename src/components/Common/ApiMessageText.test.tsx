import { apiMessagePatterns, apiMessages } from '@app/i18n/apiMessages';
import { matchApiMessage } from '@app/utils/apiMessage';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { IntlProvider } from 'react-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ApiMessageText from './ApiMessageText';

let dom: JSDOM;
let root: Root;
beforeEach(() => {
  dom = new JSDOM('<!doctype html><div id="root"></div>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('React', React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  root = createRoot(document.getElementById('root')!);
});
afterEach(async () => {
  await act(async () => root.unmount());
  dom.window.close();
  vi.unstubAllGlobals();
});

it('updates a stored API message when the interface locale changes', async () => {
  const raw = 'A browser session is required.';
  const match = matchApiMessage(raw)!;
  expect(match).toBeDefined();
  const render = async (locale: string, message: string) =>
    act(async () =>
      root.render(
        <IntlProvider
          locale={locale}
          messages={{ [apiMessages[match.key].id]: message }}
        >
          <ApiMessageText>{raw}</ApiMessageText>
        </IntlProvider>
      )
    );
  await render('de', 'Eine Browsersitzung ist erforderlich.');
  expect(document.body.textContent).toContain(
    'Eine Browsersitzung ist erforderlich.'
  );
  await render('fr', 'Une session de navigateur est requise.');
  expect(document.body.textContent).toContain(
    'Une session de navigateur est requise.'
  );
  expect(raw).toBe('A browser session is required.');
});

it('isolates and escapes captured data while preserving unknown provider text', async () => {
  const entry = apiMessagePatterns.find(
    ([, parts]) => parts.length > 1 && parts[0].length > 8
  )!;
  const [key, parts] = entry;
  const values = parts
    .slice(1)
    .map((_, index) => `<provider-${index}> & {كتاب}`);
  const raw = parts.map((part, index) => part + (values[index] ?? '')).join('');
  expect(matchApiMessage(raw)?.key).toBe(key);
  await act(async () =>
    root.render(
      <IntlProvider
        locale="de"
        messages={{ [apiMessages[key].id]: apiMessages[key].defaultMessage }}
      >
        <ApiMessageText>{raw}</ApiMessageText>
        <ApiMessageText>Custom provider text: كتاب</ApiMessageText>
      </IntlProvider>
    )
  );
  for (const value of values)
    expect(document.body.textContent).toContain(value);
  expect(document.querySelector('provider-0')).toBeNull();
  expect(document.querySelectorAll('bdi').length).toBeGreaterThan(0);
  expect(document.body.textContent).toContain('Custom provider text: كتاب');
});
