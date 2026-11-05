import type * as FormikTypes from 'formik';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { IntlProvider } from 'react-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AudiobookshelfModal from './index';

const state = vi.hoisted(() => ({
  post: vi.fn(),
  put: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('axios', () => ({
  default: {
    post: state.post,
    put: state.put,
    isAxiosError: (error: unknown) =>
      typeof error === 'object' &&
      error !== null &&
      'isAxiosError' in error &&
      error.isAxiosError === true,
  },
}));
vi.mock('@app/hooks/useToasts', () => ({
  default: () => ({ addToast: state.toast }),
}));
vi.mock('@app/components/Common/Modal', async () => {
  const formik = await vi.importActual<typeof FormikTypes>('formik');
  return {
    default: ({
      children,
      onSecondary,
      secondaryDisabled,
      secondaryText,
    }: {
      children: React.ReactNode;
      onSecondary: () => void;
      secondaryDisabled: boolean;
      secondaryText: string;
    }) => {
      const { values, setValues } =
        formik.useFormikContext<Record<string, unknown>>();
      return (
        <div role="dialog">
          <button
            type="button"
            data-testid="fill-connection-details"
            onClick={() =>
              // The port input stores what the user typed, which is a string.
              void setValues({
                ...values,
                hostname: 'abs.example',
                port: '13380',
                apiKey: 'test-api-key',
              })
            }
          >
            Fill connection details
          </button>
          <button
            type="button"
            data-testid="test-connection"
            disabled={secondaryDisabled}
            onClick={onSecondary}
          >
            {secondaryText}
          </button>
          {children}
        </div>
      );
    },
  };
});

let dom: JSDOM;
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/settings/services',
  });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('HTMLButtonElement', dom.window.HTMLButtonElement);
  vi.stubGlobal('React', React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  state.post.mockResolvedValue({
    data: { libraries: [{ id: 'lib-1', name: 'Audiobooks' }] },
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  dom.window.close();
  vi.unstubAllGlobals();
});

it('sends the port as a number when testing an edited connection', async () => {
  await act(async () =>
    root.render(
      <IntlProvider locale="en">
        <AudiobookshelfModal
          settings={null}
          onClose={() => undefined}
          onSave={() => undefined}
        />
      </IntlProvider>
    )
  );

  await act(async () => {
    container
      .querySelector<HTMLButtonElement>(
        '[data-testid="fill-connection-details"]'
      )
      ?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  await act(async () => {
    container
      .querySelector<HTMLButtonElement>('[data-testid="test-connection"]')
      ?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  expect(state.post).toHaveBeenCalledWith(
    '/api/v1/settings/audiobookshelf/test',
    expect.objectContaining({
      hostname: 'abs.example',
      port: 13380,
      apiKey: 'test-api-key',
    })
  );
  expect(typeof state.post.mock.calls[0]?.[1]?.port).toBe('number');
});
