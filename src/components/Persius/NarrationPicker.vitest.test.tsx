import type { EditionComparison } from '@server/lib/editionCompare';
import type { BookDetails } from '@server/models/Book';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { IntlProvider } from 'react-intl';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import BookDetail, { NarrationPicker } from './BookDetail';

const fixture = vi.hoisted(() => ({
  data: undefined as EditionComparison | undefined,
  error: undefined as Error | undefined,
  mutate: vi.fn(),
  request: undefined as Record<string, unknown> | undefined,
}));
vi.mock('@app/hooks/useBookEditions', () => ({ default: () => fixture }));
vi.mock('@app/components/Common/Button', () => ({
  default: ({ buttonType: _, ...props }: Record<string, unknown>) => (
    <button {...props} />
  ),
}));
vi.mock('@app/components/Common/CachedImage', () => ({
  default: ({ src }: { src: string }) => <img alt="" src={src} />,
}));
vi.mock('next/link', () => ({
  default: ({ children }: { children: unknown }) => children,
}));
vi.mock('next/dynamic', () => ({
  default: () => (props: Record<string, unknown>) => {
    fixture.request = props;
    return <div data-testid="request-modal" />;
  },
}));
vi.mock('react-markdown', () => ({ default: () => null }));
let dom: JSDOM;
let root: Root;
const book = {
  id: 'bookshelf:1:d29yazE',
  mediaType: 'book',
  title: 'A Book',
  author: 'An Author',
  narrators: ['Original'],
} as BookDetails;
const render = async (canRequest = true) =>
  act(async () => {
    root.render(
      <IntlProvider locale="en">
        <NarrationPicker
          book={book}
          available
          canRequest={canRequest}
          playback={<button>Listen</button>}
        />
      </IntlProvider>
    );
  });
const click = async (element: Element | null) =>
  act(async () => {
    (element as HTMLElement).click();
  });
beforeEach(() => {
  dom = new JSDOM('<!doctype html><div id="root"></div>', {
    url: 'https://seerr.example/',
  });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(dom.window.HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(dom.window.HTMLMediaElement.prototype, 'pause').mockImplementation(
    () => {}
  );
  fixture.data = {
    format: 'audiobook',
    source: 'library',
    supportsAlongside: true,
    editions: [
      {
        id: 'ed1',
        title: 'A Book',
        format: 'audiobook',
        narrators: ['Original'],
        owned: true,
        selected: true,
        abridged: 'unabridged',
        production: 'solo',
        unknownFields: [],
      },
      {
        id: 'ed2',
        title: 'A Book',
        format: 'audiobook',
        narrators: ['Another voice'],
        owned: false,
        selected: false,
        abridged: 'unabridged',
        language: 'eng',
        production: 'solo',
        sampleUrl: 'https://cdn.example/preview.mp3',
        editionLabel: 'Anniversary',
        unknownFields: [],
      },
    ],
  };
  fixture.error = undefined;
  fixture.request = undefined;
  fixture.mutate.mockClear();
  root = createRoot(document.getElementById('root')!);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.restoreAllMocks();
  dom.window.close();
  vi.unstubAllGlobals();
});

test('requests the chosen edition of the same work, preserving alongside capability', async () => {
  await render();
  expect(document.querySelector<HTMLInputElement>('input:checked')?.value).toBe(
    'ed2'
  );
  expect(document.body.textContent).toContain('Recommended');
  expect(document.body.textContent).toContain('Anniversary');
  await click(document.querySelector('.persius-request-recording'));
  expect(fixture.request).toMatchObject({
    bookId: book.id,
    initialBookFormat: 'audiobook',
    initialEditionChoice: {
      editionId: 'ed2',
      variantKey: 'ed2',
      policy: 'alongside',
    },
  });
});
test('owned recordings and permission denial cannot create another request', async () => {
  await render(false);
  expect(
    document.querySelector<HTMLButtonElement>('.persius-request-recording')
      ?.disabled
  ).toBe(true);
  await click(document.querySelector('input[value="ed1"]'));
  expect(document.querySelector('.persius-request-recording')).toBeNull();
  expect(document.body.textContent).toContain('Listen');
});
test('missing variant capability does not silently request alongside', async () => {
  fixture.data!.supportsAlongside = false;
  await render();
  await click(document.querySelector('.persius-request-recording'));
  expect(fixture.request?.initialEditionChoice).toMatchObject({
    editionId: 'ed2',
    policy: 'only',
  });
});
test('samples load on demand and stop when recording selection changes', async () => {
  await render();
  expect(document.querySelector('audio')?.getAttribute('src')).toBeNull();
  await click(document.querySelector('.persius-sample button'));
  expect(document.querySelector('audio')?.getAttribute('src')).toBe(
    'https://cdn.example/preview.mp3'
  );
  expect(dom.window.HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  await click(document.querySelector('input[value="ed1"]'));
  expect(document.querySelector('audio')?.getAttribute('src')).toBeNull();
  expect(dom.window.HTMLMediaElement.prototype.pause).toHaveBeenCalled();
});
test('catalog failure retains a known recording and exposes retry', async () => {
  fixture.data = undefined;
  fixture.error = new Error('Unavailable');
  await render();
  expect(document.querySelectorAll('.persius-recording')).toHaveLength(1);
  expect(document.body.textContent).toContain('Original');
  const retry = [...document.querySelectorAll('button')].find(
    (button) => button.textContent === 'Retry'
  );
  await click(retry!);
  expect(fixture.mutate).toHaveBeenCalledOnce();
});

test('a cached edition catalog immediately updates the format coverage tile', async () => {
  await act(async () =>
    root.render(
      <IntlProvider locale="en">
        <BookDetail
          data={book}
          coverage={[
            { format: 'audiobook', available: true, requested: false },
          ]}
          format="audiobook"
          onFormatChange={() => {}}
          actions={null}
          canRequest
        />
      </IntlProvider>
    )
  );
  expect(
    document.querySelector('.persius-format-tiles')?.textContent
  ).toContain('1 of 2 in library');
});
