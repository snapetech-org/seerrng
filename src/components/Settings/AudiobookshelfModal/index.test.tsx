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
      onOk,
      okDisabled,
    }: {
      children: React.ReactNode;
      onSecondary: () => void;
      secondaryDisabled: boolean;
      secondaryText: string;
      onOk: () => void;
      okDisabled: boolean;
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
          <button
            type="button"
            data-testid="save-connection"
            disabled={okDisabled}
            onClick={onOk}
          >
            Save connection
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

for (const automatic of [true, false]) {
  it(`enables saving after ${automatic ? 'automatic' : 'manual'} library selection and persists its name`, async () => {
    const onSave = vi.fn();
    state.put.mockResolvedValue({ data: {} });
    if (!automatic)
      state.post.mockResolvedValue({
        data: {
          libraries: [
            { id: 'lib-1', name: 'Audiobooks' },
            { id: 'lib-2', name: 'Second library' },
          ],
        },
      });
    await act(async () =>
      root.render(
        <IntlProvider locale="en">
          <AudiobookshelfModal
            settings={null}
            onClose={() => undefined}
            onSave={onSave}
          />
        </IntlProvider>
      )
    );
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="fill-connection-details"]'
        )!
        .click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="test-connection"]')!
        .click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    if (!automatic) {
      expect(
        container.querySelector<HTMLButtonElement>(
          '[data-testid="save-connection"]'
        )!.disabled
      ).toBe(true);
      await act(async () => {
        const select =
          container.querySelector<HTMLSelectElement>('#libraryId')!;
        select.value = 'lib-2';
        select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
    const save = container.querySelector<HTMLButtonElement>(
      '[data-testid="save-connection"]'
    )!;
    expect(save.disabled).toBe(false);
    await act(async () => {
      save.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(state.put).toHaveBeenCalledWith(
      '/api/v1/settings/audiobookshelf',
      expect.objectContaining({
        port: 13380,
        libraryId: automatic ? 'lib-1' : 'lib-2',
        libraryName: automatic ? 'Audiobooks' : 'Second library',
      })
    );
    expect(onSave).toHaveBeenCalledOnce();
  });
}
