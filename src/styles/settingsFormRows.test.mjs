import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import postcss from 'postcss';

const css = readFileSync(new URL('./globals.css', import.meta.url), 'utf8');
const categories = readFileSync(
  new URL(
    '../components/Settings/SettingsCategories/index.tsx',
    import.meta.url
  ),
  'utf8'
);

test('compact-description settings rows keep labels prominent and spacing tight', () => {
  const rules = new Map();
  postcss.parse(css).walkRules((rule) => {
    if (rule.selectors.length !== 1) return;
    if (!rule.selectors[0].startsWith('.settings-form-row-compact-description'))
      return;
    rules.set(rule.selectors[0], rule.nodes ?? []);
  });

  assert.match(categories, /className="settings-form-row-compact-description"/);
  assert.ok(
    rules
      .get('.settings-form-row-compact-description')
      ?.some(
        (node) =>
          node.type === 'decl' && node.prop === 'row-gap' && node.value === '0'
      )
  );
  assert.match(
    css,
    /\.settings-form-row-compact-description > label\s*\{\s*@apply text-sm leading-5 font-semibold;/
  );
  assert.match(
    css,
    /\.settings-form-row-compact-description \.settings-form-row-description\s*\{\s*@apply mt-\[5px\] text-xs leading-4;/
  );
});
