import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { CompactRatingSelect, FilterResetButton } from './CompactFilterSelect';

beforeEach(() => vi.stubGlobal('React', React));

it('renders the shared reset icon and selected state', () => {
  const html = renderToStaticMarkup(
    <FilterResetButton label="Clear Filters" selected onClick={() => {}} />
  );
  expect(html).toContain('Clear Filters');
  expect(html).toContain('aria-pressed="true"');
  expect(html).toContain('app-filter-button-active');
  expect(html).toContain('aria-hidden="true"');
  expect(html).toContain('<svg');
});

it('looks available when there are filters to clear', () => {
  const html = renderToStaticMarkup(
    <FilterResetButton
      label="Clear Filters"
      selected={false}
      onClick={() => {}}
    />
  );
  expect(html).toContain('app-filter-button-idle');
  expect(html).not.toContain('app-filter-reset-button-idle');
  expect(html).not.toContain('disabled=');
});

it('shows the selected rating threshold beside its stars', () => {
  const html = renderToStaticMarkup(
    <CompactRatingSelect
      label="TMDB Rating"
      value="7.5-plus"
      showScoreValue
      options={[
        { label: 'Any', value: 'any' },
        { label: '7.5+', value: '7.5-plus', gte: '7.5', score: 7.5 },
      ]}
      onChange={() => {}}
    />
  );

  expect(html).toContain('aria-label="TMDB Rating: 7.5+"');
  expect(html).toContain('data-filter-region="value">7.5+</span>');
});
