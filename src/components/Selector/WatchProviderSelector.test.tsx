import type { WatchProviderDetails } from '@server/models/common';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import type * as ReactIntl from 'react-intl';
import { afterEach, expect, it, vi } from 'vitest';
import { WatchProviderSelector } from './index';

const fixtureState = vi.hoisted(() => ({
  providers: [] as WatchProviderDetails[],
  isLoading: false,
}));
vi.mock('swr', () => ({
  default: () => ({
    data: fixtureState.providers,
    isLoading: fixtureState.isLoading,
  }),
}));
vi.mock('@app/hooks/useSettings', () => ({
  default: () => ({ currentSettings: { discoverRegion: 'US' } }),
}));
vi.mock('@app/hooks/useSearchActivity', () => ({
  useSearchActivityReporter: vi.fn(),
}));
vi.mock('@app/hooks/useDiscover', () => ({
  encodeURIExtraParams: encodeURIComponent,
}));
vi.mock('react-intl', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactIntl>()),
  useIntl: () => ({
    formatMessage: ({ defaultMessage }: { defaultMessage: string }) =>
      defaultMessage,
  }),
}));
vi.mock('@app/components/Common/Tooltip', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@app/components/Common/CachedImage', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <img src={src} alt={alt} />
  ),
}));
vi.mock('@app/components/Common/Button', () => ({
  default: (
    props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
      buttonSize?: string;
      disabledReason?: string;
    }
  ) => {
    const attributes = { ...props };
    delete attributes.buttonSize;
    delete attributes.disabledReason;
    return <button {...attributes} />;
  },
}));
vi.mock('@app/components/RegionSelector', () => ({
  default: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (name: string, value: string) => void;
  }) => (
    <select
      aria-label="Region"
      value={value}
      onChange={(event) => onChange('watchRegion', event.target.value)}
    >
      <option value="US">US</option>
      <option value="GB">GB</option>
    </select>
  ),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function fixture(
  run: (doc: Document, onChange: ReturnType<typeof vi.fn>) => Promise<void>,
  options: {
    activeProviders?: number[];
    providers?: WatchProviderDetails[];
  } = {}
) {
  const dom = new JSDOM('<form><div id="root"></div></form>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('React', React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  fixtureState.isLoading = false;
  fixtureState.providers =
    options.providers ??
    Array.from({ length: 27 }, (_, id) => ({
      id,
      name: `Fixture Provider ${id}`,
      logoPath: `/provider-${id}.png`,
      displayPriority: id,
    })).reverse();
  const onChange = vi.fn();
  const root = createRoot(document.getElementById('root')!);
  try {
    await act(async () =>
      root.render(
        <WatchProviderSelector
          type="tv"
          region="US"
          regionLabel="Region"
          activeProviders={options.activeProviders ?? [0, 26]}
          onChange={onChange}
        />
      )
    );
    onChange.mockClear();
    await run(document, onChange);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
}

function tiles(doc: Document) {
  return Array.from(
    doc.querySelectorAll<HTMLButtonElement>('.provider-container')
  );
}

it('initial provider choices use named native non-submit buttons and expose selection', async () => {
  await fixture(async (doc) => {
    const choices = tiles(doc);
    expect(choices).toHaveLength(24);
    choices.forEach((choice, index) => {
      expect(choice.tagName).toBe('BUTTON');
      expect(choice.type).toBe('button');
      expect(choice.getAttribute('aria-label')).toBe(
        `Fixture Provider ${index}`
      );
      expect(choice.getAttribute('aria-pressed')).toBe(String(index === 0));
      expect(choice.getAttribute('data-selected')).toBe(String(index === 0));
      expect(choice.querySelector('img')?.getAttribute('alt')).toBe('');
      expect(choice.querySelector('img')?.getAttribute('src')).toContain(
        `/provider-${index}.png`
      );
      expect(choice.hasAttribute('role')).toBe(false);
      expect(choice.hasAttribute('tabindex')).toBe(false);
    });
  });
});

it('expanded choices retain order, names and state without changing the filter', async () => {
  await fixture(async (doc, onChange) => {
    const expand = () =>
      doc.querySelector<HTMLButtonElement>(
        '[data-provider-region="expand-control"]'
      )!;
    await act(async () => expand().click());
    const expanded = Array.from(
      doc.querySelectorAll<HTMLButtonElement>(
        '[data-provider-region="expanded"] .provider-container'
      )
    );
    expect(expanded).toHaveLength(3);
    expanded.forEach((choice, index) => {
      expect(choice.tagName).toBe('BUTTON');
      expect(choice.type).toBe('button');
      expect(choice.getAttribute('aria-label')).toBe(
        `Fixture Provider ${index + 24}`
      );
      expect(choice.getAttribute('aria-pressed')).toBe(String(index === 2));
      expect(choice.getAttribute('data-selected')).toBe(String(index === 2));
      expect(choice.querySelector('img')?.getAttribute('alt')).toBe('');
    });
    expect(onChange).not.toHaveBeenCalled();
    await act(async () => expand().click());
    expect(tiles(doc)).toHaveLength(24);
    expect(tiles(doc)[0].getAttribute('aria-pressed')).toBe('true');
    expect(onChange).not.toHaveBeenCalled();
  });
});

it('selects all regional providers, including collapsed choices, and clears them', async () => {
  await fixture(async (doc, onChange) => {
    const selectAll = doc.querySelector<HTMLButtonElement>(
      '[data-provider-region="actions"] button'
    )!;
    const clearAll = doc.querySelectorAll<HTMLButtonElement>(
      '[data-provider-region="actions"] button'
    )[1];
    const submit = vi.fn((event: Event) => event.preventDefault());
    doc.querySelector('form')!.addEventListener('submit', submit);

    expect(selectAll.textContent).toBe('Select All');
    expect(clearAll.textContent).toBe('Clear All');
    expect(selectAll.type).toBe('button');
    expect(clearAll.type).toBe('button');
    expect(selectAll.disabled).toBe(false);
    expect(clearAll.disabled).toBe(false);

    await act(async () => selectAll.click());

    expect(onChange).toHaveBeenCalledExactlyOnceWith('US', [
      0,
      26,
      ...Array.from({ length: 25 }, (_, index) => index + 1),
    ]);
    expect(selectAll.disabled).toBe(true);
    expect(clearAll.disabled).toBe(false);

    await act(async () =>
      doc
        .querySelector<HTMLButtonElement>(
          '[data-provider-region="expand-control"]'
        )!
        .click()
    );
    expect(tiles(doc)).toHaveLength(27);
    expect(
      tiles(doc).every(
        (provider) => provider.getAttribute('aria-pressed') === 'true'
      )
    ).toBe(true);

    onChange.mockClear();
    await act(async () => clearAll.click());

    expect(onChange).toHaveBeenCalledExactlyOnceWith('US', []);
    expect(selectAll.disabled).toBe(false);
    expect(clearAll.disabled).toBe(true);
    expect(
      tiles(doc).every(
        (provider) => provider.getAttribute('aria-pressed') === 'false'
      )
    ).toBe(true);
    expect(submit).not.toHaveBeenCalled();
  });
});

it('uses provider identity rather than selected-array length when enabling select all', async () => {
  await fixture(
    async (doc, onChange) => {
      const selectAll = doc.querySelector<HTMLButtonElement>(
        '[data-provider-region="actions"] button'
      )!;

      expect(selectAll.disabled).toBe(false);
      await act(async () => selectAll.click());

      expect(onChange).toHaveBeenCalledExactlyOnceWith(
        'US',
        Array.from({ length: 27 }, (_, index) => index)
      );
      expect(selectAll.disabled).toBe(true);
    },
    {
      activeProviders: [
        ...Array.from({ length: 26 }, (_, index) => index),
        999,
      ],
    }
  );
});

it('disables selecting an empty provider list and lets stale selections be cleared', async () => {
  await fixture(
    async (doc, onChange) => {
      const actions = doc.querySelectorAll<HTMLButtonElement>(
        '[data-provider-region="actions"] button'
      );
      const [selectAll, clearAll] = actions;

      expect(selectAll.disabled).toBe(true);
      expect(clearAll.disabled).toBe(false);
      await act(async () => clearAll.click());
      expect(onChange).toHaveBeenCalledExactlyOnceWith('US', []);
      expect(clearAll.disabled).toBe(true);
    },
    { activeProviders: [999], providers: [] }
  );
});

it('each native activation toggles once and preserves region reset and selected-ID ordering', async () => {
  await fixture(async (doc, onChange) => {
    const submit = vi.fn((event: Event) => event.preventDefault());
    doc.querySelector('form')!.addEventListener('submit', submit);
    await act(async () => tiles(doc)[1].click());
    expect(onChange).toHaveBeenCalledExactlyOnceWith('US', [0, 26, 1]);
    expect(tiles(doc)[1].getAttribute('aria-pressed')).toBe('true');
    onChange.mockClear();
    await act(async () => tiles(doc)[1].click());
    expect(onChange).toHaveBeenCalledExactlyOnceWith('US', [0, 26]);
    expect(tiles(doc)[1].getAttribute('aria-pressed')).toBe('false');
    expect(submit).not.toHaveBeenCalled();
    onChange.mockClear();
    await act(async () =>
      doc
        .querySelector<HTMLButtonElement>(
          '[data-provider-region="expand-control"]'
        )!
        .click()
    );
    await act(async () => tiles(doc)[26].click());
    expect(onChange).toHaveBeenCalledExactlyOnceWith('US', [0]);
    expect(tiles(doc)[26].getAttribute('aria-pressed')).toBe('false');
    onChange.mockClear();
    await act(async () => tiles(doc)[26].click());
    expect(onChange).toHaveBeenCalledExactlyOnceWith('US', [0, 26]);
    expect(tiles(doc)[26].getAttribute('aria-pressed')).toBe('true');
    expect(submit).not.toHaveBeenCalled();
    onChange.mockClear();
    const region = doc.querySelector<HTMLSelectElement>('select')!;
    await act(async () => {
      region.value = 'GB';
      region.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledExactlyOnceWith('GB', []);
    expect(
      tiles(doc).every((tile) => tile.getAttribute('aria-pressed') === 'false')
    ).toBe(true);
  });
});
