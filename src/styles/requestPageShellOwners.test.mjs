import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { styleContract } from './cssContract.mjs';

const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');
const css = read('./globals.css');
const summaryFallback =
  ':where(.detail-summary-card:not(.app-card-inset):not(.app-card-sub))';
const mediaFallback = ':where(.media-detail-card:not(.app-card-main))';

// These source contracts protect a mechanical migration of established values.
// They are not computed-style checks or human visual approval.
const verifyShellOwners = (source) => {
  const contract = styleContract(source);
  const value = (selector, property) =>
    contract.declaration(selector, property)?.replace(/\s+/g, ' ').trim();
  for (const [selector, properties] of [
    ['.detail-summary-card', { padding: 'var(--inset-card-padding)' }],
    [
      summaryFallback,
      {
        'border-radius': '0.5rem',
        'border-width': '1px',
        'border-style': 'solid',
        'border-color': 'rgb(var(--color-gray-700))',
      },
    ],
    [
      '.media-detail-card',
      {
        position: 'relative',
        overflow: 'hidden',
        'background-color': 'rgb(var(--color-gray-800) / 0.2)',
        'box-shadow':
          '0 10px 15px -3px rgb(var(--color-gray-950) / 0.2), 0 4px 6px -4px rgb(var(--color-gray-950) / 0.2)',
      },
    ],
    [
      mediaFallback,
      {
        'border-radius': '0.75rem',
        'border-width': '1px',
        'border-style': 'solid',
        'border-color': 'rgb(var(--color-gray-700))',
      },
    ],
    [
      '.app-tooltip',
      {
        position: 'absolute',
        'border-radius': '0.25rem',
        border: '1px solid rgb(var(--color-gray-600))',
        'background-color': 'rgb(var(--color-gray-800))',
        padding: '4px 8px',
        'font-size': 'var(--card-body-font-size)',
        'line-height': '1.25rem',
        'font-weight': 'var(--card-table-value-weight)',
        color: 'rgb(var(--color-gray-100))',
        'box-shadow':
          '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
        'z-index': '10010',
        'max-width': 'min(28rem, calc(100vw - 2rem))',
        'white-space': 'normal',
        'overflow-wrap': 'anywhere',
        'pointer-events': 'auto',
      },
    ],
  ]) {
    for (const [property, expected] of Object.entries(properties)) {
      assert.equal(
        value(selector, property),
        expected,
        selector + ' ' + property
      );
    }
    for (const rule of contract.rulesFor(selector)) {
      rule.walkAtRules('apply', () =>
        assert.fail(selector + ' must remain native')
      );
      rule.walkDecls((declaration) => {
        assert.doesNotMatch(
          declaration.prop + ': ' + declaration.value,
          /--tw-/,
          selector + ' must not depend on Tailwind generated state'
        );
      });
    }
  }
  for (const selector of ['.detail-summary-card', '.media-detail-card']) {
    for (const property of [
      'border',
      'border-radius',
      'border-width',
      'border-style',
      'border-color',
    ]) {
      assert.equal(
        value(selector, property),
        undefined,
        selector + ' leaves framed geometry to shared card owners'
      );
    }
  }
  for (const property of [
    'padding',
    'backdrop-filter',
    '-webkit-backdrop-filter',
  ]) {
    assert.equal(
      value('.media-detail-card', property),
      undefined,
      'main media paint does not duplicate shared spacing/blur ownership'
    );
  }
  assert.equal(
    value(
      ':is(.app-card-main, .app-card-sub, .app-card-inset)',
      'border-width'
    ),
    '0 !important'
  );
  assert.equal(value('.app-card-main', 'border-radius'), '0.75rem');
  assert.equal(
    value(':is(.app-card-sub, .app-card-inset)', 'border-radius'),
    '0.5rem'
  );
  assert.equal(
    value(
      ':is(.app-card-main, .app-card-sub, .app-card-inset)::after',
      'pointer-events'
    ),
    'none'
  );
};

test('Requests shared shell owners preserve native geometry, paint and standalone fallbacks', () => {
  verifyShellOwners(css);
});

const requestClassAttributes = (source) => {
  const ast = ts.createSourceFile(
    'Requests.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const entries = [];
  const visit = (node) => {
    if (
      ts.isJsxAttribute(node) &&
      node.name.getText(ast) === 'className' &&
      node.initializer &&
      ts.isStringLiteral(node.initializer)
    ) {
      entries.push({
        classes: new Set(node.initializer.text.split(/\s+/).filter(Boolean)),
        start: node.initializer.getStart(ast),
        end: node.initializer.getEnd(),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return entries;
};

const verifyRequestsFrameAttachments = (source) => {
  const classSets = requestClassAttributes(source).map(
    (entry) => entry.classes
  );
  for (const [role, frame, surface] of [
    ['media-detail-card', 'app-card-main', 'refreshed-card-surface'],
    ['detail-summary-card', 'app-card-inset', 'refreshed-inset-surface'],
  ]) {
    const consumers = classSets.filter((classes) => classes.has(role));
    assert.ok(consumers.length > 0, 'Requests retains a ' + role + ' consumer');
    for (const classes of consumers) {
      assert.ok(classes.has(frame), role + ' retains shared frame ' + frame);
      assert.ok(
        classes.has(surface),
        role + ' retains shared surface ' + surface
      );
    }
  }
};

const rewriteRequestClassTokens = (source, transform) =>
  requestClassAttributes(source)
    .sort((left, right) => right.start - left.start)
    .reduce(
      (result, entry) =>
        result.slice(0, entry.start) +
        JSON.stringify(transform([...entry.classes]).join(' ')) +
        result.slice(entry.end),
      source
    );

test('Requests explicitly selects shared main and inset frame owners', () => {
  verifyRequestsFrameAttachments(read('../components/Requests/index.tsx'));
});

test('Requests frame checks accept reordered classes and extra harmless roles', () => {
  const source = read('../components/Requests/index.tsx');
  const reordered = rewriteRequestClassTokens(source, (classes) => [
    ...classes.reverse(),
    'fixture-harmless-role',
  ]);
  assert.notEqual(reordered, source);
  verifyRequestsFrameAttachments(reordered);
});

test('Requests frame checks reject missing main and inset attachments', () => {
  const source = read('../components/Requests/index.tsx');
  for (const [role, frame] of [
    ['media-detail-card', 'app-card-main'],
    ['detail-summary-card', 'app-card-inset'],
  ]) {
    const broken = rewriteRequestClassTokens(source, (classes) =>
      classes.includes(role)
        ? classes.filter((token) => token !== frame)
        : classes
    );
    assert.notEqual(
      broken,
      source,
      'negative fixture actually removes ' + frame
    );
    assert.throws(
      () => verifyRequestsFrameAttachments(broken),
      new RegExp(role + ' retains shared frame ' + frame)
    );
  }
});

const verifySoftwareSpacing = (source) => {
  const contract = styleContract(source);
  for (const selector of [
    '.app-compact-request-card',
    '.app-compact-request-history',
  ]) {
    // rulesFor includes matching rules inside media queries; a responsive
    // duplicate must not be hidden by a shared !important padding owner.
    for (const rule of contract.rulesFor(selector)) {
      rule.walkAtRules('apply', () =>
        assert.fail(selector + ' must remain native')
      );
      for (const declaration of rule.nodes) {
        if (declaration.type === 'decl') {
          assert.doesNotMatch(
            declaration.prop,
            /^padding(?:-|$)/,
            selector + ' must not duplicate shared surface padding'
          );
        }
      }
    }
  }
  for (const selector of [
    '.app-compact-request-list',
    '.app-compact-request-summary',
    '.app-compact-request-header',
    '.app-compact-request-badges',
    '.app-compact-request-history-list',
  ]) {
    assert.equal(
      contract.declaration(selector, 'gap'),
      'var(--card-spacing)',
      selector + ' consumes shared card spacing'
    );
  }
  assert.equal(
    contract.declaration('.app-compact-request-section', 'gap'),
    '0.75rem',
    'the existing section heading boundary remains independent'
  );
  assert.equal(
    contract.declaration('.refreshed-card-surface', 'padding'),
    'var(--main-card-padding) !important'
  );
  assert.equal(
    contract.declaration('.refreshed-inset-surface', 'padding'),
    'var(--inset-card-padding) !important'
  );
};

const verifySoftwareSurfaceAttachments = (source) => {
  const classSets = requestClassAttributes(source).map(
    (entry) => entry.classes
  );
  for (const [role, surface] of [
    ['app-compact-request-card', 'refreshed-card-surface'],
    ['app-compact-request-history', 'refreshed-inset-surface'],
  ]) {
    const consumers = classSets.filter((classes) => classes.has(role));
    assert.ok(consumers.length > 0, 'Software Requests retains ' + role);
    for (const classes of consumers) {
      assert.ok(
        classes.has(surface),
        role + ' retains shared padding owner ' + surface
      );
    }
  }
};

test('Software Requests uses shared surface padding and established card gaps', () => {
  verifySoftwareSpacing(css);
  verifySoftwareSurfaceAttachments(
    read('../components/RequestStatus/SoftwareRequests.tsx')
  );
});

test('Software Requests checks reject competing padding at any breakpoint and disconnected gaps', () => {
  for (const brokenRule of [
    '.app-compact-request-card { padding: 12px; }',
    '@media (min-width: 640px) { .app-compact-request-card { padding: 16px; } }',
    '.app-compact-request-history { padding-inline: 8px; }',
    '.app-compact-request-list { gap: 12px; }',
    '.app-compact-request-summary { gap: 8px; }',
    '.app-compact-request-header { gap: 4px; }',
    '.app-compact-request-badges { gap: 4px; }',
    '.app-compact-request-history-list { gap: 4px; }',
  ]) {
    assert.throws(() => verifySoftwareSpacing(css + '\n' + brokenRule));
  }
});

test('Software Requests checks reject missing shared surface padding owners', () => {
  const source = read('../components/RequestStatus/SoftwareRequests.tsx');
  for (const [role, surface] of [
    ['app-compact-request-card', 'refreshed-card-surface'],
    ['app-compact-request-history', 'refreshed-inset-surface'],
  ]) {
    const broken = rewriteRequestClassTokens(source, (classes) =>
      classes.includes(role)
        ? classes.filter((token) => token !== surface)
        : classes
    );
    assert.notEqual(broken, source);
    assert.throws(
      () => verifySoftwareSurfaceAttachments(broken),
      new RegExp(role + ' retains shared padding owner ' + surface)
    );
  }
});

test('the shared tooltip uses a floating portal and one semantic class owner', () => {
  const source = read('../components/Common/Tooltip/index.tsx');
  assert.match(source, /\['app-tooltip', className\]/);
  assert.match(source, /<FloatingPortal>/);
  assert.match(source, /role: interactive \? 'dialog' : 'tooltip'/);
  assert.match(
    source,
    /data-interactive=\{interactive \? 'true' : undefined\}/
  );
  assert.match(source, /findFocusableDescendant/);
  const tooltipStyle = styleContract(css);
  assert.equal(
    tooltipStyle.declaration(
      ".app-tooltip[data-interactive='true']",
      'overflow-y'
    ),
    'auto'
  );
  assert.equal(
    tooltipStyle.declaration(
      ".app-tooltip[data-interactive='true']",
      'max-height'
    ),
    'min(24rem, var(--app-tooltip-available-height, 80vh))'
  );
});

test('shell checks reject geometry, paint, tooltip and retired-owner regressions', () => {
  for (const brokenRule of [
    '.detail-summary-card { border-radius: 20px; }',
    summaryFallback + ' { border-width: 0; }',
    '.media-detail-card { padding: 1rem; }',
    '.media-detail-card { box-shadow: none; }',
    '.media-detail-card { background-color: black; }',
    '.app-tooltip { position: fixed; }',
    '.app-tooltip { padding: 20px; }',
    '.app-tooltip { z-index: 1; }',
    '.app-tooltip { @apply rounded; }',
    '.media-detail-card { --tw-shadow: 0 0 #0000; }',
  ]) {
    assert.throws(() => verifyShellOwners(css + '\n' + brokenRule));
  }
});

test('native shell guards stay bounded to the migrated role owners', () => {
  verifyShellOwners(
    css +
      '\n.fixture-unrelated-role { @apply rounded; --tw-ring-shadow: 0 0 #0000; }'
  );
});
