import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { styleContract } from './cssContract.mjs';

const css = readFileSync(new URL('./globals.css', import.meta.url), 'utf8');

const assertDisclosurePalette = (source) => {
  const contract = styleContract(source);
  for (const [state, opacity, background] of [
    ['', '90%, transparent', 'hsl(286 79% 10% / 0.55)'],
    [':hover', '65%, white', 'hsl(286 79% 20% / 0.7)'],
    [':active', '80%, white', 'hsl(286 79% 20% / 0.85)'],
  ]) {
    const selector = `.detail-disclosure-control${state}`;
    assert.equal(
      contract.declaration(selector, 'border-color'),
      `color-mix(in srgb, var(--palette-plum) ${opacity})`
    );
    assert.equal(
      contract.declaration(selector, 'background-color'),
      background
    );
    assert.equal(
      contract.declaration(selector, 'color'),
      state === ':hover' ? '#fff' : 'hsl(286 79% 69%)'
    );
  }
  assert.equal(
    contract.declaration('.detail-disclosure-control', 'height'),
    'var(--action-control-height)'
  );
  assert.equal(
    contract.declaration('.detail-disclosure-control', 'line-height'),
    'var(--action-control-content-height)'
  );
  assert.notEqual(
    contract.declaration('.detail-disclosure-control', 'color'),
    contract.declaration('.app-button-manage', 'color')
  );
};

test('detail disclosures retain their shared Plum role separately from Manage and use global geometry', () => {
  assertDisclosurePalette(css);
});

test('disclosure contract rejects a changed palette or disconnected global height', () => {
  assert.throws(() =>
    assertDisclosurePalette(
      css.replaceAll('var(--palette-plum)', 'var(--palette-green)')
    )
  );
  assert.throws(() =>
    assertDisclosurePalette(
      css.replaceAll('height: var(--action-control-height);', 'height: 20px;')
    )
  );
});

// These legacy violet accents deliberately differ from the Plum body role.
// Source ownership checks do not replace browser cascade or visual acceptance.
const assertNativeDisclosureStates = (source) => {
  const contract = styleContract(source);
  const value = (selector, property) =>
    contract.declaration(selector, property)?.replace(/\s+/g, ' ').trim();
  const control = '.detail-disclosure-control';
  for (const [property, expected] of Object.entries({
    '--detail-disclosure-accent': 'oklch(60.6% 0.25 292.717)',
    '--detail-disclosure-focus-color': 'var(--detail-disclosure-accent)',
    '--detail-disclosure-focus-border': 'oklch(81.1% 0.111 293.571)',
    display: 'inline-flex',
    'align-items': 'stretch',
    overflow: 'hidden',
    'border-radius': 'var(--control-corner-radius)',
    'border-width': '1px',
    'border-style': 'solid',
    'font-size': 'var(--card-table-font-size)',
    'font-weight': '500',
    height: 'var(--action-control-height)',
    'min-height': 'var(--action-control-height)',
    'max-height': 'var(--action-control-height)',
    'line-height': 'var(--action-control-content-height)',
  })) {
    assert.equal(
      value(control, property),
      expected,
      'native disclosure ' + property
    );
  }
  assert.equal(
    value(control + ':focus-within', 'border-color'),
    'var(--detail-disclosure-focus-border)',
    'default focus retains the legacy violet border'
  );
  for (const child of ['.detail-disclosure-pin', '.detail-disclosure-button']) {
    assert.equal(
      value(child + ':focus', 'box-shadow'),
      'inset 0 0 0 2px var(--detail-disclosure-focus-color)',
      'child focus consumes the native inherited focus color'
    );
    assert.equal(value(child + ':focus', 'outline'), 'none');
    assert.equal(value(child, 'display'), 'inline-flex');
    assert.equal(value(child, 'align-items'), 'center');
    assert.equal(value(child, 'justify-content'), 'center');
  }
  assert.equal(
    value('.detail-disclosure-pin', 'border-inline-end-color'),
    'color-mix( in oklab, var(--detail-disclosure-accent) 90%, transparent )'
  );
  assert.equal(
    value('.detail-disclosure-pin-active', 'background-color'),
    'color-mix( in oklab, var(--detail-disclosure-accent) 35%, transparent )'
  );
  assert.equal(value('.detail-disclosure-pin-active', 'color'), '#fff');
  const pinned = '.pinned-filter-section ' + control;
  assert.equal(
    value(pinned, '--detail-disclosure-focus-color'),
    'var(--palette-blue)',
    'pinned sections reconnect the inherited Blue focus chain'
  );
  assert.equal(
    value(pinned + ':focus-within', 'border-color'),
    'color-mix(in srgb, var(--palette-blue) 65%, white)'
  );
  assert.equal(
    value(
      '.pinned-filter-section .detail-disclosure-pin',
      'border-inline-end-color'
    ),
    'color-mix( in srgb, var(--palette-blue) 90%, transparent )'
  );
  assert.equal(
    value(
      '.pinned-filter-section .detail-disclosure-pin-active',
      'background-color'
    ),
    'hsl(217 100% 20% / 0.55)'
  );
  assert.equal(
    value('.pinned-filter-section .detail-disclosure-pin-active', 'color'),
    '#fff'
  );
  // Scope the native-only guard to this migrated role, not unrelated card
  // frames, legacy widgets, or production/backend behavior.
  for (const selector of [
    control,
    control + ':focus',
    control + ':focus-within',
    '.detail-disclosure-pin',
    '.detail-disclosure-pin:focus',
    '.detail-disclosure-button',
    '.detail-disclosure-button:focus',
    '.detail-disclosure-pin-active',
    pinned,
    pinned + ':focus-within',
    '.pinned-filter-section .detail-disclosure-pin',
    '.pinned-filter-section .detail-disclosure-pin-active',
  ]) {
    for (const rule of contract.rulesFor(selector)) {
      rule.walkAtRules('apply', () =>
        assert.fail('disclosure role must remain native')
      );
      rule.walkDecls((declaration) => {
        assert.doesNotMatch(
          declaration.prop + ': ' + declaration.value,
          /--tw-/,
          'disclosure role must not depend on Tailwind generated state'
        );
      });
    }
  }
  for (const selector of [
    control,
    '.detail-disclosure-pin',
    '.detail-disclosure-button',
  ]) {
    // Exact role selectors have equal specificity. In the reduced-motion
    // condition, include unconditional declarations and matching media rules
    // in source order: an earlier override must not hide a later transition.
    const transitions = contract.rulesFor(selector).flatMap((rule) => {
      for (let ancestor = rule.parent; ancestor; ancestor = ancestor.parent) {
        if (
          ancestor.type === 'atrule' &&
          ancestor.name === 'media' &&
          ancestor.params !== '(prefers-reduced-motion: reduce)'
        )
          return [];
      }
      return rule.nodes.filter(
        (node) => node.type === 'decl' && node.prop === 'transition'
      );
    });
    const important = transitions.filter(
      (declaration) => declaration.important
    );
    assert.equal(
      (important.length ? important : transitions).at(-1)?.value,
      'none',
      'effective reduced-motion transition ownership for ' + selector
    );
  }
};

test('native pin and focus states preserve legacy violet and pinned Blue overrides', () => {
  assertNativeDisclosureStates(css);
});

test('native disclosure checks reject lost focus, palette drift, and retired owners', () => {
  for (const brokenRule of [
    '.detail-disclosure-control { --detail-disclosure-accent: var(--palette-plum); }',
    '.detail-disclosure-control:focus-within { border-color: transparent; }',
    '.detail-disclosure-button:focus { box-shadow: none; }',
    '.pinned-filter-section .detail-disclosure-control { --detail-disclosure-focus-color: var(--palette-plum); }',
    '.detail-disclosure-pin-active { background-color: transparent; }',
    '.detail-disclosure-control { border-radius: 20px; }',
    '.detail-disclosure-button { @apply inline-flex; }',
    '.detail-disclosure-pin:focus { --tw-ring-color: red; }',
  ]) {
    assert.throws(() => assertNativeDisclosureStates(css + '\n' + brokenRule));
  }
});

test('disclosure guards do not reject unrelated legacy card-frame variables', () => {
  assertNativeDisclosureStates(
    css + '\n.fixture-card-frame { --tw-ring-shadow: 0 0 #0000; }'
  );
});

test('reduced-motion checks reject a later unconditional transition on each role', () => {
  for (const selector of [
    '.detail-disclosure-control',
    '.detail-disclosure-pin',
    '.detail-disclosure-button',
  ]) {
    assert.throws(
      () =>
        assertNativeDisclosureStates(
          css + '\n' + selector + ' { transition: color 150ms ease; }'
        ),
      /effective reduced-motion transition ownership/
    );
  }
});

test('reduced-motion checks reject a removed native override', () => {
  const contract = styleContract(css);
  const rules = contract.rulesFor('.detail-disclosure-control');
  let removed = 0;
  for (const rule of rules) {
    if (
      rule.parent.type === 'atrule' &&
      rule.parent.name === 'media' &&
      rule.parent.params === '(prefers-reduced-motion: reduce)'
    ) {
      for (const declaration of [...rule.nodes]) {
        if (declaration.type === 'decl' && declaration.prop === 'transition') {
          declaration.remove();
          removed++;
        }
      }
    }
  }
  assert.ok(removed > 0, 'negative fixture actually removes the override');
  const broken = rules[0].root().toString();
  assert.notEqual(broken, css);
  assert.throws(
    () => assertNativeDisclosureStates(broken),
    /effective reduced-motion transition ownership/
  );
});
