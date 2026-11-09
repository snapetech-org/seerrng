import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { IntlProvider } from 'react-intl';
import { expect, it, vi } from 'vitest';
import BookOrbitRequestActions from './BookOrbitRequestActions';

vi.mock('@app/components/Common/Tooltip', () => ({
  default: ({
    children,
    content,
  }: {
    children: React.ReactNode;
    content: string;
  }) => <span title={content}>{children}</span>,
}));

const render = (links: { format: 'ebook' | 'audiobook'; url: string }[]) =>
  renderToStaticMarkup(
    <IntlProvider locale="en">
      <BookOrbitRequestActions links={links} />
    </IntlProvider>
  );

it('shows distinct accessible actions for both BookOrbit formats', () => {
  const html = render([
    { format: 'ebook', url: 'https://books.example/requests/31' },
    { format: 'audiobook', url: 'https://books.example/requests/32' },
  ]);
  expect(html).toContain('Open book request in BookOrbit');
  expect(html).toContain('Open audiobook request in BookOrbit');
  expect(html).toContain('href="https://books.example/requests/31"');
  expect(html).toContain('href="https://books.example/requests/32"');
  expect(html).toContain('Review or manage this request');
  expect(html).toContain('noopener noreferrer');
});

it('does not render an unsafe request URL', () => {
  const html = render([
    { format: 'ebook', url: 'javascript:alert(1)' },
    { format: 'audiobook', url: '//other.example/requests/2' },
  ]);
  expect(html).not.toContain('<a');
});
