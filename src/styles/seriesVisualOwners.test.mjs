import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import postcss from 'postcss';
import ts from 'typescript';
import { auditTailwindClassExpressions } from './tailwindClassVerifier.mjs';

const source = (path) =>
  readFileSync(new URL(`../components/${path}`, import.meta.url), 'utf8');
const css = readFileSync(new URL('./globals.css', import.meta.url), 'utf8');
const nativeRoles = [
  '.subject-tag',
  '.format-request-control',
  '.format-request-control-single',
  '.format-request-single-label',
  '.format-request-label',
  '.format-request-option',
  '.media-inset-heading',
  '.media-inset-table-heading',
  '.detail-item-interactive',
  '.media-page',
  '.request-listbox-control',
  '.request-listbox-button',
];

const verifyNativeOwners = (stylesheet) => {
  const root = postcss.parse(stylesheet);
  const shared = postcss.parse(
    readFileSync(
      new URL('./interfaceThemes/shared.css', import.meta.url),
      'utf8'
    )
  );
  const definitions = new Set();
  for (const stylesheetRoot of [shared, root])
    stylesheetRoot.walkDecls((decl) => {
      if (decl.prop.startsWith('--')) definitions.add(decl.prop);
    });
  for (const role of nativeRoles) {
    let found = false;
    root.walkRules((rule) => {
      if (
        !rule.selectors.some(
          (selector) =>
            selector === role ||
            selector.startsWith(`${role}:`) ||
            selector.startsWith(`${role}[`) ||
            (role === '.subject-tag' && selector.startsWith('.subject-tag-'))
        )
      )
        return;
      found = true;
      rule.walkAtRules('apply', () =>
        assert.fail(`${role} retains utility ownership`)
      );
      rule.walkDecls((decl) => {
        for (const match of decl.value.matchAll(/var\((--[a-z\d-]+)/g)) {
          assert.ok(
            definitions.has(match[1]),
            `${role} references undefined ${match[1]}`
          );
        }
      });
    });
    assert.ok(found, `${role} has an authored owner`);
  }
};

test('migrated Series/request assets select semantic roles without presentation utilities', () => {
  for (const path of [
    'TvDetails/index.tsx',
    'TvDetails/SeriesDetailsLayout.tsx',
    'RequestModal/TvRequestModal.tsx',
    'RequestModal/RequestMediaCard.tsx',
    'RequestModal/RequestSeasonEpisodeTree.tsx',
    'RequestModal/RequestFooterStatus.tsx',
    'RequestModal/AdvancedOptionsDisclosureButton.tsx',
    'Common/FormatRequestControl/index.tsx',
  ]) {
    const audit = auditTailwindClassExpressions({ path, source: source(path) });
    assert.deepEqual(
      audit.utilities,
      [],
      `${path} competing presentation classes`
    );
    assert.deepEqual(
      audit.unresolved,
      path === 'Common/FormatRequestControl/index.tsx'
        ? ["className ?? ''"]
        : [],
      `${path} class composition must be traced`
    );
  }
});

test('quality-control caller styling is traced instead of treating external class props as verified', () => {
  const path = 'MediaDetails/MediaQualitySelect.tsx';
  const quality = auditTailwindClassExpressions({ path, source: source(path) });
  assert.deepEqual(quality.utilities, []);
  assert.deepEqual(quality.unresolved, ["className ?? ''"]);
  for (const caller of [
    'TvDetails/SeriesDetailsLayout.tsx',
    'RequestModal/TvRequestModal.tsx',
  ]) {
    const file = ts.createSourceFile(
      caller,
      source(caller),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );
    let found = false;
    const visit = (node) => {
      if (
        (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
        node.tagName.getText(file) === 'MediaQualitySelect'
      ) {
        found = true;
        assert.ok(
          !node.attributes.properties.some(
            (attr) =>
              ts.isJsxAttribute(attr) && attr.name.getText(file) === 'className'
          ),
          `${caller} introduces an untraced quality class override`
        );
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
    assert.ok(found);
  }
});

test('native shared roles retain valid palette references and no scoped apply rules', () => {
  verifyNativeOwners(css);
});

test('native owner audit rejects utility reintroduction and undefined palette bindings', () => {
  assert.throws(
    () =>
      verifyNativeOwners(`${css}\n.format-request-control { @apply text-sm; }`),
    /utility ownership/
  );
  assert.throws(
    () =>
      verifyNativeOwners(
        `${css}\n.format-request-option { color: var(--missing-color); }`
      ),
    /undefined --missing-color/
  );
});

test('request summary reuses shared artwork, table and frame contracts', () => {
  const summary = source('RequestModal/TvRequestModal.tsx');
  const artwork = source('RequestModal/RequestMediaCard.tsx');
  assert.match(summary, /className="app-detail-summary-grid"/);
  assert.match(summary, /className="card-table detail-paired-columns"/);
  assert.match(summary, /className="card-table-group"/);
  assert.match(summary, /data-wrap="true"\s+data-lines="2"/);
  assert.match(
    artwork,
    /<MediaDetailArtwork type=\{artworkType\} src=\{artwork\}/
  );
  assert.match(artwork, /data-card-part="content"/);
  assert.doesNotMatch(
    artwork,
    /style=|refreshed-artwork-scrim|refreshed-artwork-gradient/
  );
});

test('folder choice states keep their existing callback and expose selected state to native CSS', () => {
  const advanced = source('RequestModal/AdvancedRequester/index.tsx');
  assert.match(advanced, /hidden=\{panelOnly\}/);
  assert.match(advanced, /hidden=\{!rootFolderTable && serviceOptionsHidden\}/);
  assert.match(
    advanced,
    /onClick=\{\(\) => selectRequestFolder\(folder.path \?\? ''\)\}/
  );
  assert.match(
    advanced,
    /data-table-part="choice-row"\s+aria-pressed=\{isSelected\}/
  );
  const root = postcss.parse(css);
  const states = new Set();
  root.walkRules((rule) => {
    if (rule.selector.includes("[data-table-layout='request-folders']")) {
      assert.ok(
        !rule.nodes.some(
          (node) => node.type === 'atrule' && node.name === 'apply'
        )
      );
      if (rule.selector.includes('[aria-pressed=')) states.add('selected');
      if (rule.selector.includes(':focus-visible')) states.add('focus');
      if (rule.selector.includes('[data-scrollable=')) states.add('scroll');
    }
  });
  assert.deepEqual([...states].sort(), ['focus', 'scroll', 'selected']);
});
