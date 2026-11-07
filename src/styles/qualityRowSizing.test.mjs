import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import postcss from 'postcss';
import ts from 'typescript';

const css = readFileSync(new URL('./globals.css', import.meta.url), 'utf8');
const declarations = (stylesheet, selector, properties) => {
  const values = new Map();
  postcss.parse(stylesheet).walkRules((rule) => {
    if (!rule.selectors.includes(selector)) return;
    for (const declaration of rule.nodes ?? []) {
      if (declaration.type !== 'decl') continue;
      if (properties && !properties.includes(declaration.prop)) continue;
      assert.ok(
        !values.has(declaration.prop),
        `${selector} has duplicate ${declaration.prop} ownership`
      );
      const value = declaration.value.replace(/\s+/g, ' ');
      values.set(
        declaration.prop,
        declaration.important ? `${value} !important` : value
      );
    }
  });
  return values;
};

const verifyContentGeometry = (stylesheet) => {
  assert.equal(
    declarations(stylesheet, ':root', ['--action-control-content-height']).get(
      '--action-control-content-height'
    ),
    '0.875rem',
    'action contents use the shared glyph box, independent of control height'
  );
  for (const selector of [
    '.format-request-label svg',
    '.format-request-single-label svg',
    '.media-rating-icon',
    '.media-rating-icon-audience',
    '.media-rating-wordmark',
    '.media-rating-value',
    '.media-rating-brand',
    '.button-standard svg.playback-provider-icon',
  ]) {
    assert.equal(
      declarations(stylesheet, selector).get('height'),
      'var(--action-control-content-height)',
      `${selector} retains the shared content height`
    );
  }
  for (const selector of [
    '.format-request-label svg',
    '.format-request-single-label svg',
  ]) {
    const icon = declarations(stylesheet, selector);
    assert.equal(icon.get('width'), 'var(--action-control-content-height)');
    assert.equal(icon.get('flex'), 'none');
  }
  assert.equal(
    declarations(stylesheet, '.media-rating-wordmark').get('width'),
    'auto'
  );
  assert.equal(
    declarations(stylesheet, '.format-request-control').get('line-height'),
    'var(--action-control-content-height)'
  );
};

test('quality icons, ratings and playback logos share one action-content height', () => {
  verifyContentGeometry(css);
});
test('missing single-option sizing and competing icon heights fail with their own diagnostics', () => {
  assert.throws(
    () =>
      verifyContentGeometry(
        css.replace(
          '.format-request-single-label svg',
          '.retired-single-label svg'
        )
      ),
    /\.format-request-single-label svg retains the shared content height/
  );
  assert.throws(
    () =>
      verifyContentGeometry(
        `${css}\n.format-request-single-label svg { height: 16px; }`
      ),
    /\.format-request-single-label svg has duplicate height ownership/
  );
  const wrongHeight = postcss.parse(css);
  let replaced = 0;
  wrongHeight.walkRules((rule) => {
    if (!rule.selectors.includes('.format-request-single-label svg')) return;
    rule.walkDecls('height', (declaration) => {
      declaration.value = '16px';
      replaced++;
    });
  });
  assert.equal(
    replaced,
    1,
    'wrong-height fixture replaces the one shared owner'
  );
  assert.throws(
    () => verifyContentGeometry(wrongHeight.toString()),
    /\.format-request-label svg retains the shared content height/
  );
});

const verifyDisabledPlayback = (stylesheet) => {
  assert.equal(
    declarations(stylesheet, '.app-button').get('border'),
    '1px solid',
    'shared controls retain a visible border'
  );
  const disabled = declarations(stylesheet, '.app-button:disabled');
  assert.equal(disabled.get('opacity'), '0.6', 'disabled opacity is shared');
  assert.equal(
    disabled.get('cursor'),
    'not-allowed',
    'disabled cursor is shared'
  );
  assert.equal(
    declarations(stylesheet, '.app-button-playback:disabled').size,
    0,
    'playback does not override the shared disabled owner'
  );
  const playback = declarations(stylesheet, '.app-button-playback');
  assert.ok(
    playback.get('border-color'),
    'playback preserves its border treatment'
  );
  assert.ok(
    playback.get('background-color'),
    'playback preserves its surface treatment'
  );
  for (const state of [':hover', ':active']) {
    assert.equal(
      declarations(stylesheet, `.app-button-playback${state}`).get(
        'background-color'
      ),
      playback.get('background-color'),
      `playback ${state} keeps the established surface`
    );
  }
  assert.equal(
    declarations(
      stylesheet,
      '.app-button[aria-haspopup]:not(.playback-dropdown-trigger)'
    ).get('height'),
    'var(--action-control-height) !important',
    'dropdown buttons share action sizing without overriding playback triggers'
  );
};
test('disabled playback retains its border and inherits shared disabled styling', () => {
  verifyDisabledPlayback(css);
});
test('a local disabled playback override cannot silently replace the shared state', () => {
  assert.throws(
    () =>
      verifyDisabledPlayback(
        `${css}\n.app-button-playback:disabled { border: none; }`
      ),
    /playback does not override the shared disabled owner/
  );
});

const iconSources = [
  ['MediaDetails/MediaQualitySelect.tsx', 'AdjustmentsHorizontalIcon', 1],
  ['Common/FormatRequestControl/index.tsx', 'ArrowDownTrayIcon', 3],
];
const localGeometryPrefixes = [
  'h-',
  'w-',
  'size-',
  'min-h-',
  'max-h-',
  'min-w-',
  'max-w-',
];
const hasLocalGeometryUtility = (className) =>
  className
    .split(/\s+/)
    .some((token) =>
      token
        .split(':')
        .some((segment) =>
          localGeometryPrefixes.some((prefix) => segment.startsWith(prefix))
        )
    );
const verifyNoLocalIconGeometry = (source, tag, expectedCount) => {
  const tree = ts.createSourceFile(
    'Control.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  let count = 0;
  const visit = (node) => {
    if (
      (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
      node.tagName.getText(tree) === tag
    ) {
      count++;
      for (const attribute of node.attributes.properties) {
        assert.ok(
          ts.isJsxAttribute(attribute),
          `${tag} attributes stay auditable`
        );
        const name = attribute.name.getText(tree);
        assert.ok(
          !['style', 'width', 'height'].includes(name),
          `${tag} has no local geometry override`
        );
        if (name === 'className') {
          assert.ok(
            attribute.initializer && ts.isStringLiteral(attribute.initializer),
            `${tag} class owner stays auditable`
          );
          assert.equal(
            hasLocalGeometryUtility(attribute.initializer.text),
            false,
            `${tag} has no local geometry utility`
          );
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.equal(
    count,
    expectedCount,
    `${tag} remains present in each supported branch`
  );
};
test('shared Quality and Request icons do not override global sizing with local utilities', () => {
  for (const [file, tag, count] of iconSources) {
    verifyNoLocalIconGeometry(
      readFileSync(new URL(`../components/${file}`, import.meta.url), 'utf8'),
      tag,
      count
    );
  }
});
test('local icon utility and inline sizing regressions fail closed', () => {
  assert.throws(
    () =>
      verifyNoLocalIconGeometry(
        '<ArrowDownTrayIcon className="h-4 w-4" />',
        'ArrowDownTrayIcon',
        1
      ),
    /ArrowDownTrayIcon has no local geometry utility/
  );
  assert.throws(
    () =>
      verifyNoLocalIconGeometry(
        '<ArrowDownTrayIcon style={{height:16}} />',
        'ArrowDownTrayIcon',
        1
      ),
    /ArrowDownTrayIcon has no local geometry override/
  );
});
test('geometry utility scan preserves variants without ambiguous backtracking', () => {
  assert.equal(hasLocalGeometryUtility('app-action-icon md:hover:w-4'), true);
  assert.equal(hasLocalGeometryUtility('app-action-icon md:max-h-8'), true);
  assert.equal(hasLocalGeometryUtility('app-action-icon'), false);
  const repeatedVariants = '!:'.repeat(10_000);
  assert.equal(
    hasLocalGeometryUtility(`${repeatedVariants}app-action-icon`),
    false
  );
  assert.equal(hasLocalGeometryUtility(`${repeatedVariants}h-4`), true);
});
