import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { IntlProvider } from 'react-intl';
import { beforeEach, expect, it, vi } from 'vitest';
import FocusedIssue from './FocusedIssue';
const state = vi.hoisted(() => ({ error: false }));
vi.mock('swr', () => ({
  default: () => ({
    data: { id: 6, media: { mediaType: 'comic' } },
    error: state.error,
  }),
}));
vi.mock('next/router', () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('@app/components/Common/LoadingSpinner', () => ({
  default: () => null,
}));
vi.mock('@app/components/IssueList/IssueItem', () => ({
  default: ({ initiallyExpanded }: { initiallyExpanded: boolean }) => (
    <article data-expanded={initiallyExpanded}>Inline issue</article>
  ),
}));
beforeEach(() => {
  vi.stubGlobal('React', React);
  state.error = false;
});
const render = () =>
  renderToStaticMarkup(
    <IntlProvider locale="en">
      <FocusedIssue issueId={6} />
    </IntlProvider>
  );
it('opens the shared inline card expanded with an escape to the complete list', () => {
  expect(render()).toContain('data-expanded="true"');
  expect(render()).toContain('Show All Issues');
});
it('does not render issue details after a permission or missing-issue error', () => {
  state.error = true;
  expect(render()).toContain('role="alert"');
  expect(render()).not.toContain('Inline issue');
});
