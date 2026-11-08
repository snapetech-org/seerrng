import { expect, type Locator } from '@playwright/test';

export async function expectSummaryPairsAligned(summary: Locator) {
  const pairs = await summary.locator('dt').evaluateAll((labels) =>
    labels.flatMap((label) => {
      const value = label.nextElementSibling;
      if (value?.tagName !== 'DD') return [];
      return [
        {
          label: label.textContent?.trim(),
          value: value.textContent?.trim(),
          labelTop: label.getBoundingClientRect().top,
          valueTop: value.getBoundingClientRect().top,
        },
      ];
    })
  );
  expect(pairs.length).toBeGreaterThan(0);
  for (const pair of pairs) {
    expect(
      Math.abs(pair.labelTop - pair.valueTop),
      JSON.stringify(pair)
    ).toBeLessThanOrEqual(3);
  }
  const stackedGroups = await summary
    .locator('.detail-three-column-grid')
    .evaluateAll((grids) =>
      grids.flatMap((grid) => {
        if (getComputedStyle(grid).gridTemplateColumns.split(' ').length !== 1)
          return [];
        return [
          {
            groups: [...grid.children].map((child) =>
              child.getBoundingClientRect().toJSON()
            ),
            pairedColumns: [
              ...grid.querySelectorAll('.detail-paired-columns'),
            ].map(
              (fields) =>
                getComputedStyle(fields).gridTemplateColumns.split(' ').length
            ),
            dividers: [
              ...grid.querySelectorAll('.media-detail-column-divider'),
            ].flatMap((divider) => {
              const style = getComputedStyle(divider, '::before');
              if (['none', 'normal'].includes(style.content)) return [];
              return [
                {
                  width: parseFloat(style.width),
                  height: parseFloat(style.height),
                },
              ];
            }),
          },
        ];
      })
    );
  for (const { groups, pairedColumns, dividers } of stackedGroups) {
    for (const columns of pairedColumns) expect(columns).toBe(2);
    for (const divider of dividers) {
      expect(divider.height).toBeGreaterThan(0);
      expect(divider.width).toBeGreaterThan(divider.height);
    }
    for (let index = 1; index < groups.length; index++) {
      expect(groups[index].top).toBeGreaterThanOrEqual(
        groups[index - 1].bottom - 1
      );
    }
  }
}
