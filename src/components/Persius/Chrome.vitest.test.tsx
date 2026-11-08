import { renderToStaticMarkup } from 'react-dom/server';
import { IntlProvider } from 'react-intl';
import { expect, test, vi } from 'vitest';
import { PersiusAccountLabel } from './Chrome';

const fixture = vi.hoisted(() => ({ data: undefined as unknown }));
vi.mock('swr', () => ({ default: () => ({ data: fixture.data }) }));
vi.mock('@app/hooks/useUser', () => ({
  useUser: () => ({ user: { id: 1, displayName: 'Reader' } }),
}));
vi.mock('@app/components/Layout/ThemePicker', () => ({ default: () => null }));
vi.mock('@app/context/ThemeContext', () => ({
  useTheme: () => ({ mode: 'dark', toggleMode: vi.fn() }),
}));
const render = () =>
  renderToStaticMarkup(
    <IntlProvider locale="en">
      <PersiusAccountLabel />
    </IntlProvider>
  );

for (const data of [
  undefined,
  {},
  { adult: { limit: 0 } },
  { music: { limit: 0 } },
]) {
  test(`account label tolerates a quota payload without movie quota: ${JSON.stringify(data)}`, () => {
    fixture.data = data;
    expect(render()).toContain('Reader');
    expect(render()).not.toContain('<small>');
  });
}
test('account label retains the movie allowance when supplied', () => {
  fixture.data = { movie: { limit: 10, remaining: 7 } };
  expect(render()).toContain('<small>');
  expect(render()).toContain('7');
});
