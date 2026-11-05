import { Permission } from '@server/lib/permissions';
import axios from 'axios';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { IntlProvider } from 'react-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AdvancedRequester from './AdvancedRequester';

const state = vi.hoisted(() => ({
  servers: [] as unknown[],
  permissions: undefined as number | undefined,
  details: undefined as unknown,
}));

vi.mock('swr', () => ({
  default: (key: string | null) => ({
    data:
      key === '/api/v1/service/sonarr'
        ? state.servers
        : /^\/api\/v1\/service\/sonarr\/\d+$/.test(key ?? '')
          ? state.details
          : key === '/api/v1/user?take=1000&sort=displayname'
            ? { results: [] }
            : undefined,
    error: undefined,
    isValidating: false,
  }),
}));

vi.mock('@headlessui/react', async () => {
  const React = await import('react');
  type ListboxContextValue = {
    open: boolean;
    setOpen: (open: boolean) => void;
    value: unknown;
    onChange: (value: unknown) => void;
  };
  const ListboxContext = React.createContext<ListboxContextValue | null>(null);
  const useListbox = () => {
    const context = React.useContext(ListboxContext);
    if (!context) throw new Error('Listbox controls must be inside a Listbox.');
    return context;
  };
  const ListboxRoot = ({
    as = 'div',
    className,
    value,
    onChange,
    children,
  }: {
    as?: string;
    className?: string;
    value: unknown;
    onChange: (value: unknown) => void;
    children: React.ReactNode | ((state: { open: boolean }) => React.ReactNode);
  }) => {
    const [open, setOpen] = React.useState(false);
    return React.createElement(
      ListboxContext.Provider,
      { value: { open, setOpen, value, onChange } },
      React.createElement(
        as,
        { className },
        typeof children === 'function' ? children({ open }) : children
      )
    );
  };
  const Listbox = Object.assign(ListboxRoot, {
    Label: ({
      children,
      ...props
    }: React.LabelHTMLAttributes<HTMLLabelElement>) =>
      React.createElement('label', props, children),
    Button: ({
      children,
      onClick,
      disabled,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement>) => {
      const context = useListbox();
      return React.createElement(
        'button',
        {
          ...props,
          disabled,
          type: props.type ?? 'button',
          'aria-expanded': context.open,
          onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
            onClick?.(event);
            if (!disabled) context.setOpen(!context.open);
          },
        },
        children
      );
    },
    Options: ({
      children,
      className,
    }: React.HTMLAttributes<HTMLDivElement> & {
      anchor?: string;
      portal?: boolean;
      modal?: boolean;
    }) => React.createElement('div', { className, role: 'listbox' }, children),
    Option: ({
      value,
      children,
    }: {
      value: unknown;
      children: (state: {
        selected: boolean;
        active: boolean;
      }) => React.ReactNode;
    }) => {
      const context = useListbox();
      const selected = context.value === value;
      return React.createElement(
        'button',
        {
          type: 'button',
          role: 'option',
          'aria-selected': selected,
          onClick: () => {
            context.onChange(value);
            context.setOpen(false);
          },
        },
        children({ selected, active: false })
      );
    },
  });

  return {
    Listbox,
    Transition: ({
      show,
      children,
    }: {
      show: boolean;
      children: React.ReactNode;
    }) => (show ? children : null),
  };
});

vi.mock('@app/hooks/useUser', async () => {
  const { Permission: permissions, hasPermission: checkPermission } =
    await import('@server/lib/permissions');

  return {
    Permission: permissions,
    useUser: () => ({
      user: {
        id: 7,
        permissions: state.permissions ?? permissions.MANAGE_REQUESTS,
      },
      hasPermission: (
        requested: Parameters<typeof checkPermission>[0],
        options?: Parameters<typeof checkPermission>[2]
      ) =>
        checkPermission(
          requested,
          state.permissions ?? permissions.MANAGE_REQUESTS,
          options
        ),
    }),
  };
});

vi.mock('@app/hooks/useToasts', () => ({
  default: () => ({ addToast: vi.fn() }),
}));

vi.mock('@app/components/Common/CachedImage', () => ({
  default: () => null,
}));

vi.mock('@app/components/Common/LoadingSpinner', () => ({
  SmallLoadingSpinner: () => <span>Loading</span>,
}));

vi.mock('@app/components/Common/SlideCheckbox', () => ({
  default: () => null,
}));

let dom: JSDOM;
let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  state.details = undefined;
  state.permissions = undefined;
  state.servers = [
    { id: 1, name: 'Sonarr 1', isDefault: true, is4k: false },
    { id: 2, name: 'Sonarr 2', isDefault: false, is4k: false },
  ];
  dom = new JSDOM('<!doctype html><html><body></body></html>', {
    pretendToBeVisual: true,
  });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('Element', dom.window.Element);
  vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
  vi.stubGlobal('Node', dom.window.Node);
  vi.stubGlobal('HTMLButtonElement', dom.window.HTMLButtonElement);
  vi.stubGlobal(
    'requestAnimationFrame',
    dom.window.requestAnimationFrame.bind(dom.window)
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    dom.window.cancelAnimationFrame.bind(dom.window)
  );
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

for (const editing of [false, true]) {
  it(`${editing ? 'preserves a saved' : 'loads the selected server'} zero-valued profile without clearing it implicitly`, async () => {
    state.details = {
      server: {
        id: 2,
        name: 'Sonarr 2',
        activeProfileId: 0,
        activeDirectory: '/tv',
        activeLanguageProfileId: 1,
        activeTags: [],
        isDefault: false,
        is4k: false,
      },
      profiles: [
        { id: 0, name: 'Zero Profile' },
        { id: 2, name: 'Other Profile' },
      ],
      rootFolders: [{ id: 1, path: '/tv' }],
      languageProfiles: [{ id: 1, name: 'English' }],
      tags: [],
    };
    const onChange = vi.fn();
    await act(async () =>
      root.render(
        <IntlProvider locale="en">
          <AdvancedRequester
            type="tv"
            tmdbId={123}
            tvdbId={456}
            is4k={false}
            requestId={editing ? 42 : undefined}
            defaultOverrides={{ server: 2, ...(editing ? { profile: 0 } : {}) }}
            onChange={onChange}
          />
        </IntlProvider>
      )
    );
    expect(host.querySelector('#profile')?.textContent).toContain(
      'Zero Profile'
    );
    if (editing) {
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ profile: 0 })
      );
    }
    await act(async () =>
      host.querySelector<HTMLButtonElement>('#profile')?.click()
    );
    const zero = Array.from(
      document.querySelectorAll<HTMLElement>('[role="option"]')
    ).find((option) => option.textContent?.includes('Zero Profile'));
    expect(zero).toBeDefined();
    await act(async () => zero?.click());
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        profile: editing ? null : 0,
        ...(editing ? {} : { requesterSelectedOptions: { profile: true } }),
      })
    );
  });
}

afterEach(async () => {
  await act(async () => root.unmount());
  dom.window.close();
  vi.unstubAllGlobals();
});

it('keeps a selected non-default Sonarr instance in advanced options', async () => {
  const onChange = vi.fn();

  await act(async () =>
    root.render(
      <IntlProvider locale="en">
        <AdvancedRequester
          type="tv"
          tmdbId={123}
          tvdbId={456}
          is4k={false}
          onChange={onChange}
        />
      </IntlProvider>
    )
  );

  const serverButton = host.querySelector<HTMLButtonElement>('#server');
  expect(serverButton?.textContent).toContain('Sonarr 1');

  await act(async () => {
    serverButton?.click();
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
  const secondServerOption = Array.from(
    document.querySelectorAll<HTMLElement>('[role="option"]')
  ).find((option) => option.textContent?.includes('Sonarr 2'));
  expect(secondServerOption).toBeDefined();

  await act(async () => secondServerOption?.click());

  expect(serverButton?.textContent).toContain('Sonarr 2');
  expect(onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({ server: 2 })
  );
});

it('keeps a rule-selected language profile zero distinct from a deliberate selection', async () => {
  state.permissions =
    Permission.REQUEST | Permission.REQUEST_TV | Permission.REQUEST_ADVANCED;
  state.details = {
    server: {
      id: 2,
      name: 'Sonarr 2',
      activeProfileId: 1,
      activeDirectory: '/tv',
      activeLanguageProfileId: 1,
      activeTags: [],
      isDefault: false,
      is4k: false,
    },
    profiles: [{ id: 1, name: 'Any' }],
    rootFolders: [{ id: 1, path: '/tv' }],
    languageProfiles: [
      { id: 0, name: 'Zero language' },
      { id: 1, name: 'English' },
    ],
    tags: [],
  };
  const post = vi.spyOn(axios, 'post').mockResolvedValue({
    data: {
      rootFolder: null,
      profileId: null,
      tags: [],
      languageProfileId: 0,
    },
  });
  try {
    const onChange = vi.fn();
    await act(async () =>
      root.render(
        <IntlProvider locale="en">
          <AdvancedRequester
            type="tv"
            tmdbId={123}
            tvdbId={456}
            is4k={false}
            defaultOverrides={{ server: 2 }}
            onChange={onChange}
          />
        </IntlProvider>
      )
    );
    expect(post).toHaveBeenCalled();
    expect(host.querySelector('#language')?.textContent).toContain(
      'Zero language'
    );
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        language: undefined,
        requesterSelectedOptions: undefined,
      })
    );
    await act(async () =>
      host.querySelector<HTMLButtonElement>('#language')?.click()
    );
    const zero = Array.from(
      document.querySelectorAll<HTMLElement>('[role="option"]')
    ).find((option) => option.textContent?.includes('Zero language'));
    expect(zero).toBeDefined();
    await act(async () => zero?.click());
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        language: 0,
        requesterSelectedOptions: { languageProfile: true },
      })
    );
  } finally {
    post.mockRestore();
  }
});
