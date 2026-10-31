import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import postcss from 'postcss';
import ts from 'typescript';
import { verifySemanticHeadings } from './headingSemanticVerifier.mjs';
import { auditTailwindClassExpressions } from './tailwindClassVerifier.mjs';

const css = readFileSync(new URL('./globals.css', import.meta.url), 'utf8');
const sharedCss = readFileSync(
  new URL('./interfaceThemes/shared.css', import.meta.url),
  'utf8'
);
const cssRoot = postcss.parse(css);
const origThemeCss = readFileSync(
  new URL('../../themes/seerrOrig/theme.css', import.meta.url),
  'utf8'
);
const ngjThemeCss = readFileSync(
  new URL('../../themes/seerrNGJ/theme.css', import.meta.url),
  'utf8'
);
const requestRule = css.match(/\.format-request-control\s*\{([^}]+)\}/)?.[1];
const component = (path) =>
  readFileSync(new URL(`../components/${path}`, import.meta.url), 'utf8');
const server = (path) =>
  readFileSync(new URL(`../../server/${path}`, import.meta.url), 'utf8');
const rule = (selector) => {
  const start = css.indexOf(`\n  ${selector} {`);
  const combinedStart = css.indexOf(`\n  ${selector},`);
  const matchStart = start >= 0 ? start : combinedStart;
  if (matchStart < 0) {
    return '';
  }
  const open = css.indexOf('{', matchStart);
  return css.slice(open + 1, css.indexOf('}', open));
};
const rules = (selector) => {
  const declarations = [];
  cssRoot.walkRules((rule) => {
    if (
      !postcss.list
        .comma(rule.selector)
        .some((item) => item.trim() === selector)
    ) {
      return;
    }
    declarations.push(
      rule.nodes?.map((node) => node.toString()).join('\n') ?? ''
    );
  });
  return declarations.join('\n');
};
const classNameTokens = (source) => {
  const directClassNames = [
    ...source.matchAll(/className\s*=\s*(?:"([^"]*)"|\{`([\s\S]*?)`\})/g),
  ].flatMap((match) => (match[1] ?? match[2] ?? '').split(/\s+/));
  const dynamicClassLiterals = [
    ...source.matchAll(/(['"])([^'"\r\n]*)\1/g),
  ].flatMap((match) => match[2].split(/\s+/));

  return [...directClassNames, ...dynamicClassLiterals]
    .map((token) =>
      token.replace(
        /^(?:(?:sm|md|lg|xl|2xl|card|hover|focus|focus-visible|active|disabled|group-hover|group-open|motion-reduce):)+/,
        ''
      )
    )
    .filter(Boolean);
};

const presentationUtility =
  /^(?:p[trblxy]?-.+|gap(?:-[xy])?-.+|space-[xy]-.+|text-(?:(?:xs|sm|base|lg|xl|[2-9]xl)$|\[.+|(?:gray|red|amber|yellow|green|emerald|blue|indigo|violet|purple|pink|fuchsia|rose|cyan|teal|black|white)(?:-.+)?$)|font-.+|leading-.+|bg-.+|rounded(?:-.+)?$|shadow(?:-.+)?$|backdrop-.+|ring-.+|border(?:$|-(?:[0-9]+|dashed|dotted|solid|none|gray|red|amber|yellow|green|emerald|blue|indigo|violet|purple|pink|fuchsia|rose|cyan|teal|black|white).*))$/;

test('Request Status presentation-utility matcher covers variants and exact tokens', () => {
  const sample = [
    'text-xs',
    'hover:text-white',
    'bg-gray-700',
    'px-2',
    'gap-x-3',
    'flex',
    'min-w-0',
    'sm:flex-row',
  ];
  const normalized = classNameTokens(
    sample.map((token) => `className="${token}"`).join('\n')
  );
  const violations = normalized.filter((token) =>
    presentationUtility.test(token)
  );
  assert.deepEqual(
    [...new Set(violations)],
    ['text-xs', 'text-white', 'bg-gray-700', 'px-2', 'gap-x-3']
  );
});

test('segmented Request uses the shared action height, not a fixed size', () => {
  assert.ok(requestRule);
  for (const property of ['height', 'min-height', 'max-height']) {
    assert.ok(
      requestRule.includes(`${property}: var(--action-control-height);`)
    );
  }
  assert.match(requestRule, /box-sizing: border-box;/);
  assert.doesNotMatch(requestRule, /\b(?:h|min-h|max-h)-\S+/);
});

test('Request preserves its typography, color and border styling', () => {
  assert.match(requestRule, /font-size: var\(--card-table-font-size\)/);
  assert.match(requestRule, /font-weight: 500/);
  assert.match(requestRule, /align-items: stretch/);
  assert.match(requestRule, /border-radius: var\(--control-corner-radius\)/);
  for (const property of ['color', 'background-color', 'border'])
    assert.match(
      requestRule,
      new RegExp(`(?:^|\\n)\\s*${property}:\\s*[^;]+;`)
    );
  assert.doesNotMatch(requestRule, /@apply/);
});

test('action buttons keep the 24px WCAG target without growing their text or glyphs', () => {
  assert.match(css, /--action-control-height: 1\.5rem;/);
  assert.match(css, /--action-control-content-height: 0\.875rem;/);
  assert.match(
    sharedCss,
    /--button-padding-x: var\(--interface-button-padding-x\);/
  );
  assert.match(
    sharedCss,
    /--action-control-padding-x: var\(--button-padding-x\);/
  );
  assert.match(
    sharedCss,
    /--compact-button-padding-x: var\(--button-padding-x\);/
  );
  assert.match(origThemeCss, /--interface-button-padding-x: 5px;/);
  assert.match(ngjThemeCss, /--interface-button-padding-x: 8px;/);
  assert.match(
    css,
    /padding-inline: var\(--action-control-padding-x\) !important/
  );
  assert.match(
    css,
    /padding-inline: var\(--compact-button-padding-x\) !important/
  );
  assert.match(
    css,
    /\.issue-action-value\s*\{[^}]*display: flex;[^}]*align-items: center;/s
  );
  assert.match(css, /\.button-sm\s*\{[^}]*text-xs/s);
});

test('editable inputs retain 20px while dropdown buttons share 16px action sizing', () => {
  assert.match(
    sharedCss,
    /--compact-control-height: var\(--interface-compact-control-height\);/
  );
  assert.match(origThemeCss, /--interface-compact-control-height: 1\.25rem;/);
  assert.match(ngjThemeCss, /--interface-compact-control-height: 1\.5rem;/);
  assert.match(
    css,
    /\.compact-control:is\(button, a\)\s*\{[^}]*height: var\(--action-control-height\)/
  );
  assert.match(
    css,
    /\.app-button\[aria-haspopup\]:not\(\.playback-dropdown-trigger\),\s*\.app-button\[role='combobox'\]\s*\{[^}]*height: var\(--action-control-height\) !important;/
  );
});

test('poster badges keep the shared compact poster geometry', () => {
  assert.match(css, /--poster-control-height: 1\.5rem;/);
  assert.match(css, /--poster-control-content-height: 0\.875rem;/);
  assert.match(
    sharedCss,
    /--poster-control-padding-x: var\(--button-padding-x\);/
  );
  assert.match(
    sharedCss,
    /--poster-control-gap: var\(--interface-poster-control-gap\);/
  );
  assert.match(origThemeCss, /--interface-poster-control-gap: 0\.125rem;/);
  assert.match(ngjThemeCss, /--interface-poster-control-gap: 0\.25rem;/);
  assert.match(
    css,
    /\.poster-control\s*\{[^}]*border-radius: var\(--control-corner-radius\);[^}]*height: var\(--action-control-height\);[^}]*padding-inline: var\(--button-padding-x\);[^}]*column-gap: var\(--poster-control-gap\);/s
  );
  assert.match(
    css,
    /\.poster-control \.watched-status-logo\s*\{[^}]*width: auto;[^}]*height: var\(--poster-control-content-height\);/s
  );
  for (const path of [
    'Common/MediaTypeBadge/index.tsx',
    'Common/BookFormatBadge/index.tsx',
    'Common/StatusBadgeMini/index.tsx',
    'Association/AssociationBadge.tsx',
  ]) {
    assert.match(component(path), /poster-control/, path);
  }
  assert.match(
    component('Association/AssociationBadge.tsx'),
    /poster-control poster-control-association app-control-shadow-exempt/
  );
  assert.match(
    component('TitleCard/index.tsx'),
    /poster-control poster-control-blocklist app-control-shadow-exempt/
  );
});

test('poster availability and watched badges share a translucent poster surface', () => {
  assert.match(
    css,
    /\.poster-control\s*\{[^}]*background-color: transparent;/s
  );
  assert.match(css, /--poster-control-background-opacity: 0\.7;/);
  assert.match(
    css,
    /\.poster-control\.poster-control-available\s*\{[^}]*background-color: hsl\([^)]*var\(--poster-control-background-opacity\)/s
  );
  assert.match(
    css,
    /\.poster-control\.poster-control-shared-availability\s*\{[^}]*var\(--palette-purple\)/s
  );
  assert.match(
    css,
    /\.app-badge-shared-availability\s*\{[^}]*var\(--palette-purple\)/s
  );
  assert.match(
    css,
    /\.detail-availability-shared\s*\{[^}]*var\(--palette-purple-light\)/s
  );
  assert.doesNotMatch(
    css.match(/\.watched-status-badge\s*\{([^}]+)\}/)?.[1] ?? '',
    /\bbg-black(?!\/35)\b/
  );
  assert.match(
    css.match(/\.watched-status-badge\s*\{([^}]+)\}/)?.[1] ?? '',
    /background-color: rgb\(0 0 0 \/ var\(--poster-control-background-opacity\)\)/
  );
  assert.match(
    component('Common/WatchedBadge/index.tsx'),
    /poster-control watched-status-badge/
  );
  assert.match(
    component('Common/StatusBadgeMini/index.tsx'),
    /poster-control-available/
  );
  for (const path of [
    'Common/MediaTypeBadge/index.tsx',
    'Common/BookFormatBadge/index.tsx',
    'Association/AssociationBadge.tsx',
  ]) {
    assert.match(
      component(path),
      /poster-control-(?:type|book-format|association)/
    );
  }
});

test('poster badge roles inherit the shared poster-control geometry', () => {
  const posterControl = rule('.poster-control');
  assert.match(
    posterControl,
    /border-radius:|rounded-md/,
    'the shared poster control owns its corner radius'
  );
  assert.match(posterControl, /padding-inline: var\(--button-padding-x\)/);
  assert.match(posterControl, /column-gap: var\(--poster-control-gap\)/);
  assert.match(rule('.media-type-badge-width'), /max-width: 100%/);
  assert.doesNotMatch(css, /\.poster-media-type-control\b/);
});

test('Blocklist source and Issues status badges use the standard radius', () => {
  assert.match(
    component('BlocklistedTagsBadge/index.tsx'),
    /shape=\{compact \? 'standard' : 'pill'\}/
  );
  assert.match(component('IssueList/IssueItem/index.tsx'), /shape="standard"/);
});

test('page buttons and filters retain their approved opacity levels', () => {
  for (const selector of [
    '.app-button-manage',
    '.app-button-bulk-request',
    '.app-button-ghost',
  ]) {
    const declaration = rule(selector);
    assert.match(declaration, /(?:\/ 0\.55\)|bg-[\w-]+\/55)/, selector);
  }

  assert.match(rule('.app-button-playback'), /\/ 0\.7\)/);

  assert.match(rule('.app-filter-button-idle'), /\/ 0\.55\)/);
  assert.match(rule('.app-filter-button-idle:hover'), /\/ 0\.55\)/);
  assert.match(rule('.app-filter-button-idle:active'), /\/ 0\.7\)/);

  assert.match(rule('.discover-filter-control'), /\/ 0\.35\)/);
  assert.match(rule('.discover-filter-control:hover'), /\/ 0\.55\)/);
  assert.match(rule('.discover-filter-control:active'), /\/ 0\.7\)/);

  assert.match(
    rule('.app-filter-button-active'),
    /background-color: rgb\(var\(--color-indigo-950\) \/ 0\.55\)/
  );
  assert.match(
    rule('.watched-status-badge'),
    /var\(--poster-control-background-opacity\)/
  );
});

test('icon-only modifiers inherit height without duplicating the standard button owner', () => {
  assert.doesNotMatch(
    rule('.app-button.app-button-icon-only'),
    /(?:^|\n)\s*(?:height|min-height|max-height):/
  );
  assert.match(
    rule('.app-button.button-md'),
    /height: var\(--action-control-height\)/
  );
  assert.match(
    rule('.app-button.button-md'),
    /min-height: var\(--action-control-height\)/
  );
  assert.match(
    rule('.app-button.button-md'),
    /max-height: var\(--action-control-height\)/
  );
  const lab = readFileSync(
    new URL('./visual-lab.css', import.meta.url),
    'utf8'
  );
  const labIcon = lab.match(
    /\.app-button\.app-button-icon-only\s*\{([^}]+)\}/
  )?.[1];
  assert.ok(labIcon);
  assert.doesNotMatch(labIcon, /(?:^|\n)\s*(?:height|min-height|max-height):/);
});

test('button contents do not create padding exceptions', () => {
  assert.match(
    css,
    /\.app-button\.app-button-icon-only\s*\{[^}]*padding-inline: var\(--button-padding-x\) !important;/s
  );
  assert.match(
    css,
    /\.poster-control-icon,[^}]*padding-inline: var\(--button-padding-x\) !important;/s
  );
  assert.match(
    css,
    /\.app-filter-button\s*\{[^}]*padding-inline: var\(--button-padding-x\) !important;/s
  );
  const mediaFilterOption = component('Discover/MediaFilterOption.tsx');
  assert.doesNotMatch(mediaFilterOption, /!(?:gap|p)-|\bpx-\d/);
  assert.match(mediaFilterOption, /app-filter-pin-segment/);
  assert.match(
    rule('.app-filter-segment-focus'),
    /padding-inline: var\(--button-padding-x\) !important/
  );
});

test('Request Status keeps each ordered pinnable heading above its filters', () => {
  const requests = component('Requests/index.tsx');
  assert.match(requests, /PinnedFilterSectionGroup/);
  const task = requests.indexOf("section: 'taskFilters'");
  const media = requests.indexOf("section: 'mediaFilters'");
  const filters = requests.indexOf("section: 'filters'");
  const sort = requests.indexOf("section: 'sortBy'");
  assert.ok(task >= 0 && task < media && media < filters && filters < sort);
  const pinnedSections = component('Discover/PinnedFilterSection.tsx');
  assert.match(
    pinnedSections,
    /media-detail-disclosure-row[\s\S]*DetailDisclosureButton[\s\S]*app-pinned-filter-panel/
  );
  assert.match(
    css,
    /\.app-pinned-filter-section\s*\{[^}]*margin-bottom: 20px;/s
  );
  assert.match(css, /\.discover-filter-control\s*\{[^}]*align-self: center;/s);
});

test('filter labels use the shared icon gap and pin artwork has balanced padding', () => {
  assert.match(
    rule('.discover-filter-control-label'),
    /column-gap: var\(--button-content-gap\)/
  );
  assert.match(
    rule('.detail-disclosure-pin-icon'),
    /transform:\s*rotate\(45deg\)/
  );
  assert.match(
    css,
    /\.detail-disclosure-button\s*\{[^}]*column-gap: var\(--button-content-gap\)/s
  );
  assert.match(
    rule('.app-filter-button'),
    /column-gap: var\(--button-content-gap\)/
  );
});

test('Request Status filter rows and pagination use shared geometry', () => {
  const requests = component('Requests/index.tsx');
  const pagination = component('Common/PaginationFooter/index.tsx');
  assert.equal(requests.match(/className="app-filter-row"/g)?.length, 4);
  assert.match(rule('.app-filter-row'), /gap: 5px/);
  const taskFilters = requests.slice(
    requests.indexOf("section: 'taskFilters'"),
    requests.indexOf("section: 'mediaFilters'")
  );
  assert.ok(
    taskFilters.indexOf('<CompactSelect') >
      taskFilters.indexOf('taskFilterOptions.map'),
    'User selection follows the task-filter buttons'
  );
  assert.doesNotMatch(
    taskFilters,
    /\b(?:ml-auto|ms-auto|justify-end|justify-between)\b/,
    'User selection uses the normal filter gap, not right justification'
  );
  assert.doesNotMatch(pagination, /\bh-8\b|\bpx-1\.5\b|\bpy-1\b|<select/);
  assert.match(pagination, /<CompactSelect/);
  assert.doesNotMatch(pagination, /\b(?:mr|ml)-\d/);
  const pageDeclarations = [];
  postcss.parse(css).walkRules((cssRule) => {
    if (cssRule.selectors.includes('.pagination-footer-page'))
      for (const node of cssRule.nodes)
        if (node.type === 'decl') pageDeclarations.push(node);
  });
  for (const [property, expected] of [
    ['font-size', 'var(--card-table-font-size)'],
    ['line-height', 'var(--detail-row-height)'],
    ['font-weight', 'var(--card-table-heading-weight)'],
  ])
    assert.deepEqual(
      pageDeclarations
        .filter((node) => node.prop === property)
        .map((node) => node.value),
      [expected],
      `pagination ${property} follows its single native CSS owner`
    );
  assert.match(rule('.pagination-footer-actions'), /gap: 5px/);
  assert.equal(
    pagination.match(/buttonType="success"/g)?.length,
    2,
    'Previous and Next must both use the shared green success treatment'
  );
});

test('filter and disclosure control families own the standard button geometry', () => {
  for (const selector of [
    '.app-filter-button',
    '.discover-filter-control',
    '.detail-disclosure-control',
  ]) {
    const declaration = rules(selector);
    for (const property of ['height', 'min-height', 'max-height']) {
      assert.match(
        declaration,
        new RegExp(`${property}: var\\(--action-control-height\\)`),
        selector
      );
    }
    assert.match(
      declaration,
      /line-height: var\(--action-control-content-height\)/,
      selector
    );
  }
  assert.match(
    rule('.app-filter-button'),
    /padding-inline: var\(--button-padding-x\) !important/
  );
  assert.match(
    rule('.app-filter-button'),
    /column-gap: var\(--button-content-gap\)/
  );
  assert.match(
    rule('.app-filter-select-chevron'),
    /width: var\(--action-control-content-height\);[\s\S]*height: var\(--action-control-content-height\)/
  );
  assert.match(
    css,
    /\.app-filter-button svg,[\s\S]*?\.discover-filter-control svg\s*\{[^}]*max-width: var\(--action-control-content-height\);[^}]*max-height: var\(--action-control-content-height\)/s
  );

  const compactFilters = component(
    'Discover/FilterPanel/CompactFilterSelect.tsx'
  );
  const resetAndSelectSource = compactFilters.slice(
    0,
    compactFilters.indexOf('const RatingStars')
  );
  assert.match(
    resetAndSelectSource,
    /<NoSymbolIcon className="app-action-icon"/
  );
  assert.doesNotMatch(resetAndSelectSource, /\bh-4\s+w-4\b|\bw-4\s+h-4\b/);
  assert.doesNotMatch(resetAndSelectSource, /discover-filter-control relative/);
  assert.match(rule('.discover-filter-control'), /\brelative\b/);
  assert.match(resetAndSelectSource, /app-filter-select-chevron/);
});

test('semantic heading roles discover and validate their rendered English text', (context) => {
  const english = JSON.parse(
    readFileSync(new URL('../i18n/locale/en.json', import.meta.url), 'utf8')
  );
  const files = [
    'Requests/index.tsx',
    'RequestStatus/SoftwareRequests.tsx',
    'Requests/destructiveActions.tsx',
    'Discover/PinnedFilterSection.tsx',
    'MediaDetails/DetailDisclosureButton.tsx',
    'TvDetails/SeriesDetailsLayout.tsx',
    'TvDetails/index.tsx',
    'MediaDetails/ExpandableCreditList.tsx',
    'MediaDetails/SeriesSeasonEpisodeBrowser.tsx',
    'MediaDetails/SeasonEpisodeTree.tsx',
  ].map((path) => ({ path, source: component(path) }));
  const report = verifySemanticHeadings({ files, english });

  assert.ok(
    report.candidates.some(
      (candidate) => candidate.role === 'card-table-heading'
    ),
    'card-table headings must be discovered from their semantic role'
  );
  assert.ok(
    report.candidates.some(
      (candidate) => candidate.role === 'app-timeline-label'
    ),
    'timeline headings must be discovered from their semantic role'
  );
  assert.ok(
    report.candidates.some(
      (candidate) => candidate.role === 'PageStatus.label'
    ),
    'page loading status labels must be discovered from their shared component role'
  );
  assert.deepEqual(report.errors, [], report.errors.join('\n'));
  if (report.unresolved.length > 0) {
    context.diagnostic(
      `Unresolved dynamic semantic heading sources (not treated as verified): ${report.unresolved
        .map(
          (entry) =>
            `${entry.path}:${entry.line} ${entry.role} <- ${entry.expression}`
        )
        .join('; ')}`
    );
  }
});

test('semantic heading verifier discovers new class-based headings without message lists', () => {
  const source = `
    import defineMessages from '@app/utils/defineMessages';
    const messages = defineMessages('fixture.Panel', {
      newHeading: 'Newly Added Heading',
    });
    export const Fixture = () => (
      <h2 className="brand-new-panel-heading">
        {intl.formatMessage(messages.newHeading)}
      </h2>
    );
  `;
  const report = verifySemanticHeadings({
    files: [{ path: 'Fixture.tsx', source }],
    english: { 'fixture.Panel.newHeading': 'Newly Added Heading' },
  });
  assert.equal(report.candidates.length, 1);
  assert.equal(report.candidates[0].key, 'newHeading');
  assert.deepEqual(report.errors, []);
});

test('semantic heading verifier rejects stale active-English overrides', () => {
  const source = `
    import defineMessages from '@app/utils/defineMessages';
    const messages = defineMessages('fixture.Panel', {
      heading: 'Correct Heading',
    });
    export const Fixture = () => (
      <h2 className="fixture-heading">
        {intl.formatMessage(messages.heading)}
      </h2>
    );
  `;
  const report = verifySemanticHeadings({
    files: [{ path: 'Fixture.tsx', source }],
    english: { 'fixture.Panel.heading': 'Correct heading' },
  });
  assert.ok(
    report.errors.some((error) => error.includes('active English text differs'))
  );
  assert.ok(report.errors.some((error) => error.includes('not title case')));
});

test('semantic heading verifier leaves value text untouched', () => {
  const source = `
    import defineMessages from '@app/utils/defineMessages';
    const messages = defineMessages('fixture.Panel', {
      value: 'sentence case provider value',
    });
    export const Fixture = () => (
      <dl className="card-table">
        <dd className="card-table-value">
          {intl.formatMessage(messages.value)}
        </dd>
      </dl>
    );
  `;
  const report = verifySemanticHeadings({
    files: [{ path: 'Fixture.tsx', source }],
    english: { 'fixture.Panel.value': 'sentence case provider value' },
  });
  assert.deepEqual(report.candidates, []);
  assert.deepEqual(report.errors, []);
});

test('Request Status timeline uses the shared green completion treatment', () => {
  const requests = component('Requests/index.tsx');
  assert.match(
    rule('.app-timeline-connector-complete'),
    /var\(--palette-green\)/
  );
  assert.match(
    css,
    /\.app-timeline-dot-current,[\s\S]*?\.app-timeline-dot-complete\s*\{[^}]*var\(--palette-green\)[^}]*var\(--palette-green-dark\)/s
  );
  assert.match(
    rule('.app-timeline-dot-icon'),
    /color: #fff;[\s\S]*drop-shadow/
  );
  assert.match(
    requests,
    /<CheckIcon[\s\S]*?className="app-timeline-dot-icon"[\s\S]*?strokeWidth=\{3\}/
  );
});

test('page titles have one global typography and solid color owner', () => {
  const title = rule('.page-title');
  assert.match(title, /color: rgb\(var\(--theme-heading-text\)\)/);
  assert.doesNotMatch(
    title,
    /background-image: linear-gradient|background-clip: text|color: transparent/
  );
  assert.match(title, /width: fit-content/);
  assert.match(title, /--page-title-font-size: 1\.5rem/);
  assert.match(title, /font-size: var\(--page-title-font-size\)/);
  assert.match(
    title,
    /--page-title-line-height: calc\(var\(--page-title-font-size\) \+ 4px\)/
  );
  assert.match(title, /line-height: var\(--page-title-line-height\)/);
  assert.match(
    css,
    /@media \(min-width: 640px\)\s*\{\s*\.page-title\s*\{[^}]*--page-title-font-size: 2\.25rem;/
  );
  assert.doesNotMatch(title, /@apply/);
  assert.doesNotMatch(css, /\.app-page-heading(?:\s|\s*\{)/);
  const labCss = readFileSync(
    new URL('./visual-lab.css', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(labCss, /\.page-title\s*\{/);
  assert.doesNotMatch(css + labCss, /\.text-overseerr\s*\{/);
  for (const path of [
    'Common/Header/index.tsx',
    'TvDetails/index.tsx',
    'Requests/index.tsx',
    'VisualLab/Testing.tsx',
    'Blocklist/index.tsx',
    'IssueList/index.tsx',
    'Common/Modal/index.tsx',
    'Common/SlideOver/index.tsx',
    'Common/ImageFader/index.tsx',
    'UserProfile/ProfileHeader/index.tsx',
  ]) {
    const source = component(path);
    assert.match(source, /className="[^"]*\bpage-title\b[^"]*"/);
    assert.doesNotMatch(source, /app-page-heading|text-overseerr/);
  }
  const headerAudit = auditTailwindClassExpressions({
    path: 'Common/Header/index.tsx',
    source: component('Common/Header/index.tsx'),
  });
  assert.equal(headerAudit.utilities.length, 0);
});

test('page and card layouts own spacing independently of asset appearance', () => {
  assert.match(component('Layout/index.tsx'), /className="page-layout"/);
  assert.match(
    rule('.page-layout'),
    /--page-layout-margin-top: 0px;[\s\S]*--page-layout-margin-inline: 1rem;[\s\S]*--page-layout-title-padding-before: 0px;[\s\S]*--page-layout-title-padding-after: 14px;[\s\S]*--page-layout-heading-padding-before: 20px;[\s\S]*--page-layout-heading-padding-after: 14px/
  );
  assert.match(
    rule('.page-layout .page-title-row'),
    /margin-block: 0;[\s\S]*padding-block: var\(--page-layout-title-padding-before\)\s+var\(--page-layout-title-padding-after\)/
  );
  assert.match(
    rule('.page-layout'),
    /margin-top: var\(--page-layout-margin-top\)/
  );
  assert.match(
    rule(".page-layout [data-page-layout-part='content']"),
    /padding-inline: var\(--page-layout-margin-inline\)/
  );
  assert.match(
    component('Layout/index.tsx'),
    /data-page-layout-part="content"/
  );
  assert.doesNotMatch(rule('.page-layout .page-title-row'), /margin-top:/);
  assert.match(
    rule('.page-layout .slider-header'),
    /margin-block: 0;[\s\S]*padding-block: var\(--page-layout-heading-padding-before\)\s+var\(--page-layout-heading-padding-after\)/
  );
  assert.doesNotMatch(
    css,
    /--page-layout-(?:heading-spacing-before|content-spacing-after)/
  );
  assert.match(
    rule('main.page-layout'),
    /top: calc\(4rem \+ env\(safe-area-inset-top\)\)/
  );
  assert.match(component('Layout/index.tsx'), /<main className="page-layout"/);
  assert.doesNotMatch(component('Layout/index.tsx'), /top-16/);
  assert.doesNotMatch(
    rule('.page-title-row'),
    /margin(?:-top|-bottom|-block)?:/
  );
  assert.doesNotMatch(
    rule('.slider-header'),
    /margin(?:-top|-bottom|-block)?:/
  );
  assert.match(
    rule('.card-layout'),
    /--card-spacing: var\(--card-layout-spacing\)/
  );
  assert.match(
    sharedCss,
    /--card-layout-spacing: var\(--interface-section-gap\)/
  );
  assert.match(
    css,
    /\.card-layout,\s*\.app-card-main,\s*\.app-card-sub,\s*\.app-card-inset\s*\{/
  );
  assert.match(
    rule('.card-spacing-before'),
    /margin-top: var\(--card-spacing\)/
  );
  assert.doesNotMatch(
    component('Layout/index.tsx'),
    /global-search-progress-indicator/
  );
  assert.doesNotMatch(css, /\.global-search-progress-indicator\s*\{/);
  const lab = readFileSync(
    new URL('./visual-lab.css', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(
    lab,
    /\.(?:slider-header|global-search-progress-region|global-search-progress-indicator)\s*\{|--card-spacing:/
  );
});

test('section headings share page-title treatment with their independent 24px size', () => {
  const shared = rule('.page-title');
  const heading = rules('.page-heading');
  assert.match(css, /\.page-title,\s*\.page-heading\s*\{/);
  assert.match(shared, /color: rgb\(var\(--theme-heading-text\)\)/);
  assert.doesNotMatch(shared, /background-image: linear-gradient/);
  assert.match(shared, /font-weight: 700/);
  assert.match(heading, /font-size: var\(--page-heading-font-size\)/);
  assert.match(heading, /line-height: var\(--page-heading-line-height\)/);
  assert.match(
    sharedCss,
    /--page-heading-font-size: var\(--interface-page-heading-font-size\)/
  );
  assert.match(
    heading,
    /--page-heading-line-height: calc\(var\(--page-heading-font-size\) \+ 4px\)/
  );
  assert.match(
    sharedCss,
    /--card-title-font-size: var\(--interface-card-title-font-size\)/
  );
  assert.doesNotMatch(css, /\.slider-title\s*\{/);
  const lab = readFileSync(
    new URL('./visual-lab.css', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(
    lab,
    /\.(?:page-heading|slider-title|media-slider-title)\s*\{/
  );
  const sourceRoot = new URL('../', import.meta.url);
  const files = readdirSync(sourceRoot, { recursive: true }).filter((path) =>
    path.endsWith('.tsx')
  );
  let consumers = 0;
  for (const path of files) {
    const source = readFileSync(
      new URL(path.replaceAll('\\', '/'), sourceRoot),
      'utf8'
    );
    assert.doesNotMatch(
      source,
      /class(?:Name)?\s*=\s*["'][^"']*\b(?:slider-title|media-slider-title)\b/,
      path
    );
    if (/class(?:Name)?\s*=\s*["'][^"']*\bpage-heading\b/.test(source))
      consumers++;
  }
  assert.ok(consumers > 0, 'Heading migration must have real consumers');
  const slider = component('MediaSlider/index.tsx');
  assert.match(slider, /<Link href=\{linkUrl\} className="page-heading"/);
  assert.doesNotMatch(
    slider,
    /page-heading min-w-0|<span className="truncate">\{title\}/
  );
});

test('slider navigation belongs to the real heading row and shares its baseline without offsets', () => {
  const slider = component('Slider/index.tsx');
  assert.match(slider, /className="slider-navigation"/);
  assert.doesNotMatch(slider, /absolute right-0 -mt-10/);
  assert.match(
    slider,
    /className="slider-header">\s*\{heading\}\s*\{isActive &&/
  );
  assert.match(rule('.slider-header'), /align-items: baseline/);
  const navigation = rules('.slider-navigation');
  assert.match(navigation, /margin-inline-start: auto/);
  assert.match(navigation, /align-items: baseline/);
  assert.doesNotMatch(
    navigation,
    /position: absolute|bottom:|top:|transform:|margin-top:|--page-heading-line-height:/
  );
});

test('shared control icons inherit geometry and dropdowns inherit the approved fade owner', () => {
  const animationAudit = auditTailwindClassExpressions({
    path: 'roles.tsx',
    source: '<div className="aspect-[2/3] animate-pulse transform-gpu" />',
  });
  assert.deepEqual(animationAudit.utilities.sort(), [
    'animate-pulse',
    'aspect-[2/3]',
    'transform-gpu',
  ]);
  for (const path of [
    'Common/PlayOnDeviceButton/index.tsx',
    'Common/CardTextVisibilityToggle/index.tsx',
  ]) {
    const audit = auditTailwindClassExpressions({
      path,
      source: component(path),
    });
    assert.deepEqual(
      audit.utilities,
      [],
      `${path}: no local icon-size overrides`
    );
  }
  const item = rule('.app-dropdown-item');
  assert.doesNotMatch(item, /@apply/);
  const icons = rule('.app-dropdown-item svg');
  assert.match(icons, /width: var\(--action-control-content-height\)/);
  assert.match(icons, /height: var\(--action-control-content-height\)/);
  assert.match(icons, /flex-shrink: 0/);
  const dropdown = component('Common/Dropdown/index.tsx');
  assert.doesNotMatch(
    dropdown,
    /origin-top-right|data-closed:scale-95|data-closed:opacity-0|duration-100|ease-out/
  );
  assert.match(dropdown, /<MenuItems\s+transition/);
  const placeholder = component('TitleCard/Placeholder.tsx');
  assert.match(placeholder, /app-card-poster title-card-shell/);
  assert.doesNotMatch(placeholder, /relative|rounded-xl/);
  const artwork = component('MediaDetails/MediaDetailArtwork.tsx');
  assert.doesNotMatch(artwork, /object-cover/);
  assert.match(rule('.media-detail-artwork-image'), /object-fit: cover/);
  assert.doesNotMatch(artwork, /object-top/);
  assert.match(rule('.card-layout'), /--card-artwork-position: top/);
  assert.match(
    rule('.media-detail-artwork-layer .media-detail-artwork-image'),
    /object-position: var\(--card-artwork-position\)/
  );
  assert.match(css, /background-position: var\(--card-artwork-position\)/);
  assert.match(rule('.media-detail-artwork-image'), /object-position: center/);
  for (const selector of [
    '.media-detail-artwork-layer',
    '.refreshed-artwork-scrim',
    '.refreshed-artwork-gradient',
  ]) {
    assert.doesNotMatch(rule(selector), /@apply/);
    assert.match(rule(selector), /position: absolute/);
    assert.match(rule(selector), /inset: 0/);
  }
});

test('approved control-icon cleanup retains a real shared geometry owner', () => {
  const paths = [
    'CollectionDetails/CollectionAssociationsButton.tsx',
    'CollectionDetails/CollectionPlayOnDeviceButton.tsx',
    'ComicDetails/index.tsx',
    'Discover/index.tsx',
    'IssueDetails/IssueComment/index.tsx',
    'IssueModal/CreateIssueModal/index.tsx',
    'Layout/ThemePicker/index.tsx',
    'RequestList/index.tsx',
    'RequestModal/BookRequestModal.tsx',
    'RequestModal/MovieRequestModal.tsx',
    'RequestModal/MusicRequestModal.tsx',
    'Settings/LibraryItem.tsx',
    'Settings/SettingsJellyfin.tsx',
    'UserProfile/ProfileHeader/index.tsx',
  ];
  let checkedIcons = 0;
  const literalClass = (opening) => {
    const attribute = opening.attributes.properties.find(
      (entry) =>
        ts.isJsxAttribute(entry) && entry.name.getText() === 'className'
    );
    return attribute?.initializer && ts.isStringLiteral(attribute.initializer)
      ? attribute.initializer.text
      : undefined;
  };
  for (const path of paths) {
    const file = ts.createSourceFile(
      path,
      component(path),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );
    const visit = (node) => {
      if (
        (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
        /Icon$/.test(node.tagName.getText(file))
      ) {
        let parent = node.parent;
        let control;
        while (parent) {
          if (ts.isJsxElement(parent)) {
            const opening = parent.openingElement;
            const tag = opening.tagName.getText(file);
            const classes = literalClass(opening) ?? '';
            if (
              tag === 'Button' ||
              tag === 'Dropdown.Item' ||
              /(?:^|\s)app-button(?:\s|$)/.test(classes)
            ) {
              control = { tag, classes };
              break;
            }
          }
          parent = parent.parent;
        }
        if (control) {
          const classes = literalClass(node);
          // This batch covered direct literal overrides, not unresolved dynamic
          // classes or non-control artwork. Keep that scope explicit.
          if (
            classes !== undefined ||
            !node.attributes.properties.some(
              (entry) =>
                ts.isJsxAttribute(entry) &&
                entry.name.getText(file) === 'className'
            )
          ) {
            checkedIcons++;
            const utilities = auditTailwindClassExpressions({
              path,
              source: `<span className=${JSON.stringify(classes ?? '')} />`,
            }).utilities;
            assert.deepEqual(
              utilities.filter((token) =>
                /^(?:(?:min|max)-)?[hw]-|^(?:flex-)?shrink(?:-|$)/.test(token)
              ),
              [],
              `${path}: control icons inherit dimensions without literal overrides`
            );
            if (control.tag !== 'Button' && control.tag !== 'Dropdown.Item') {
              const hasSizeOwner =
                /(?:^|\s)(?:button-(?:standard|md|sm|lg)|app-button-icon-only|poster-control)(?:\s|$)/.test(
                  control.classes
                );
              const baseIconOwner = rule('.app-button svg');
              assert.ok(
                hasSizeOwner ||
                  (/width:/.test(baseIconOwner) &&
                    /height:/.test(baseIconOwner)),
                `${path}: raw app-button icons need an actual shared dimension owner`
              );
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  assert.ok(
    checkedIcons >= 25,
    'the approved icon-removal batch stays covered'
  );
  assert.match(
    rule('.app-dropdown-item svg'),
    /width: var\(--action-control-content-height\)/
  );
  assert.match(
    rule('.app-dropdown-item svg'),
    /height: var\(--action-control-content-height\)/
  );
  assert.match(
    rule('.button-md svg.playback-provider-icon'),
    /height: var\(--action-control-content-height\)/
  );
  assert.match(rule('.button-md svg.playback-provider-icon'), /width: auto/);
});

test('poster-card titles inherit standard card-title typography without local presets', () => {
  const file = ts.createSourceFile(
    'TitleCard.tsx',
    component('TitleCard/index.tsx'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  let titles = 0;
  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(file) === 'h1') {
      const attribute = node.attributes.properties.find(
        (entry) =>
          ts.isJsxAttribute(entry) && entry.name.getText(file) === 'className'
      );
      const classSource = attribute?.getText(file) ?? '';
      assert.match(classSource, /\bcard-title\b/);
      const audit = auditTailwindClassExpressions({
        path: 'poster-title.tsx',
        source: `<h1 ${classSource} />`,
      });
      assert.deepEqual(
        audit.utilities.filter((token) =>
          /^(?:text-(?:xs|sm|base|lg|xl|[2-9]xl)|font-|leading-)/.test(token)
        ),
        []
      );
      titles++;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  assert.ok(titles > 0, 'poster titles must consume the shared title role');
  assert.match(rule('.card-title'), /font-size: var\(--card-title-font-size\)/);
  assert.match(
    sharedCss,
    /--card-title-font-size: var\(--interface-card-title-font-size\);/
  );
});

test('reviewed card titles select regular weight without changing shared title geometry', () => {
  assert.match(
    rule(".card-title[data-title-weight='regular']"),
    /font-weight: 400;/
  );
  assert.doesNotMatch(
    rule(".card-title[data-title-weight='regular']"),
    /font-size:|line-height:|padding|margin/
  );
  assert.match(
    component('TvDetails/SeriesDetailsLayout.tsx'),
    /className="card-title detail-summary-title"\s+data-title-weight="regular"/
  );
  assert.match(rule('.card-title'), /font-weight: 600;/);
});

test('poster sliders pass shared title weight to every media-card branch', () => {
  const slider = component('MediaSlider/index.tsx');
  const poster = component('TitleCard/index.tsx');
  const details = component('TvDetails/SeriesDetailsLayout.tsx');
  const branches = [...slider.matchAll(/<TitleCard\s[\s\S]*?\/>/g)];
  assert.ok(branches.length > 0);
  for (const [branch] of branches) {
    assert.match(branch, /titleWeight=\{posterTitleWeight\}/);
  }
  assert.match(poster, /data-title-weight=\{titleWeight\}/);
  const reviewedShelves = [...details.matchAll(/<MediaSlider\s[\s\S]*?\/>/g)];
  assert.equal(reviewedShelves.length, 2);
  for (const [shelf] of reviewedShelves) {
    assert.match(shelf, /posterTitleWeight="regular"/);
  }
  assert.doesNotMatch(component('Discover/index.tsx'), /posterTitleWeight=/);
});

test('media-grid posters pass title weight through the shared renderer without broadening rollout', () => {
  const grid = component('Common/ListView/index.tsx');
  const cards = [...grid.matchAll(/<TitleCard\s[\s\S]*?\/>/g)];
  assert.ok(cards.length > 0);
  for (const [card] of cards) {
    assert.match(card, /titleWeight=\{posterTitleWeight\}/);
  }
  assert.match(
    component('Discover/DiscoverTv/index.tsx'),
    /<ListView\s+posterTitleWeight="regular"/
  );
  assert.doesNotMatch(
    component('Discover/DiscoverMovies/index.tsx'),
    /posterTitleWeight=/
  );
});

test('all shared poster renderers use one fixed layout owner and preserve media type', () => {
  assert.doesNotMatch(css, /--poster-width\s*:/);
  assert.match(origThemeCss, /--poster-width: 150px;/);
  assert.match(ngjThemeCss, /--poster-width: 169\.2px;/);
  assert.match(rule('.poster-layout'), /width: var\(--poster-width\)/);
  assert.match(
    rule('ul.cards-vertical.poster-grid'),
    /grid-template-columns: repeat\(auto-fill, var\(--poster-width\)\)/
  );
  assert.doesNotMatch(css, /\.discover-home \.title-card-shell/);
  assert.doesNotMatch(css, /\.discover-home \.slider-track/);
  for (const path of [
    'TitleCard/index.tsx',
    'TitleCard/Placeholder.tsx',
    'TitleCard/ErrorCard.tsx',
    'PersonCard/index.tsx',
    'ArtistCard/index.tsx',
    'AuthorCard/index.tsx',
    'MediaSlider/ShowMoreCard/index.tsx',
    'Discover/PersonalizedRows.tsx',
  ]) {
    const source = component(path);
    assert.match(source, /poster-layout/, path);
    assert.doesNotMatch(
      source,
      /w-36|md:w-44|md:w-56|md:w-\[14rem\]|paddingBottom: '150%'/,
      path
    );
    if (!path.endsWith('Placeholder.tsx'))
      assert.match(source, /data-media-type=/, path);
  }
});

test('shared poster layout owns its slots and main renderer has no local presentation utilities', () => {
  const source = component('TitleCard/index.tsx');
  const audit = auditTailwindClassExpressions({
    path: 'TitleCard/index.tsx',
    source,
  });
  assert.deepEqual(audit.utilities, []);
  assert.doesNotMatch(
    source,
    /enter="transition-|leave="transition-|opacity-[01]/
  );
  assert.match(source, /titleWeight = 'regular'/);
  assert.match(source, /data-poster-region="title"/);
  assert.match(source, /data-poster-detail=\{showFullDetailOverlay/);
  assert.match(
    rule(".poster-layout [data-poster-region='controls']"),
    /padding: var\(--poster-padding\)/
  );
  assert.match(
    rule(".poster-layout [data-poster-region='actions']"),
    /padding: var\(--poster-padding\)/
  );
  assert.match(
    rule(".poster-layout [data-poster-region='busy'] svg"),
    /width: 2\.5rem/
  );
  assert.match(rule('.app-card-poster-active'), /scale\(1\.05\)/);
  assert.doesNotMatch(
    rule('.poster-layout'),
    /font-size:|font-weight:|border:|background:/
  );
});

test('slider controls and headings share a real row and callers supply their heading through it', () => {
  const source = component('Slider/index.tsx');
  const file = ts.createSourceFile(
    'Slider.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  let navigationRows = 0;
  const visit = (node) => {
    if (
      ts.isJsxOpeningElement(node) &&
      node.attributes.properties.some(
        (attribute) =>
          ts.isJsxAttribute(attribute) &&
          attribute.name.getText(file) === 'className' &&
          attribute.initializer &&
          ts.isStringLiteral(attribute.initializer) &&
          attribute.initializer.text === 'slider-navigation'
      )
    ) {
      navigationRows++;
      let parent = node.parent.parent;
      while (parent && !ts.isJsxElement(parent)) parent = parent.parent;
      assert.ok(parent, 'Navigation must have a shared row parent');
      assert.ok(
        parent.openingElement.attributes.properties.some(
          (attribute) =>
            ts.isJsxAttribute(attribute) &&
            attribute.name.getText(file) === 'className' &&
            attribute.initializer &&
            ts.isStringLiteral(attribute.initializer) &&
            attribute.initializer.text === 'slider-header'
        )
      );
      assert.ok(
        parent.children.some(
          (child) =>
            ts.isJsxExpression(child) &&
            child.expression &&
            ts.isIdentifier(child.expression) &&
            child.expression.text === 'heading'
        )
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  assert.equal(navigationRows, 1);
  const sourceRoot = new URL('../components/', import.meta.url);
  let consumers = 0;
  for (const path of readdirSync(sourceRoot, { recursive: true }).filter(
    (path) => path.endsWith('.tsx')
  )) {
    const source = readFileSync(
      new URL(path.replaceAll('\\', '/'), sourceRoot),
      'utf8'
    );
    if (!/<Slider\b/.test(source)) continue;
    const file = ts.createSourceFile(
      path,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );
    const visit = (node) => {
      if (
        (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
        node.tagName.getText(file) === 'Slider'
      ) {
        consumers++;
        assert.ok(
          node.attributes.properties.some(
            (attribute) =>
              ts.isJsxAttribute(attribute) &&
              attribute.name.getText(file) === 'heading'
          ),
          `${path}: pass headings through the shared slider row`
        );
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  assert.ok(consumers > 0);
});

test('slider layout and items own geometry while controls use standard button sizing', () => {
  const source = component('Slider/index.tsx');
  assert.match(source, /className="slider-layout"/);
  assert.match(rule('.slider-layout'), /display: flow-root/);
  const track = rule('.slider-track');
  assert.match(
    track,
    /margin-block: calc\(-1 \* var\(--card-layout-spacing\)\)/
  );
  assert.match(
    track,
    /margin-inline: calc\(-1 \* var\(--page-layout-margin-inline\)\)/
  );
  assert.match(track, /padding: var\(--card-layout-spacing\)/);
  assert.match(track, /min-height: var\(--slider-min-height\)/);
  assert.match(
    rule('.slider-item'),
    /padding-inline: var\(--card-layout-spacing\)/
  );
  assert.match(source, /data-render-visibility=/);
  assert.equal((source.match(/buttonSize="standard"/g) ?? []).length, 2);
  assert.doesNotMatch(
    source,
    /h-8 w-8 p-0|className="h-4 w-4"|style=\{itemStyle\}|slider-item inline-block|slider-track hide-scrollbar/
  );
  const audit = auditTailwindClassExpressions({
    path: 'Slider/index.tsx',
    source,
  });
  assert.deepEqual(audit.utilities, []);
  assert.equal(audit.unresolved.length, 0);
});

test('slider empty results reuse the global orange message role without fabricated recovery', () => {
  const source = component('Slider/index.tsx');
  assert.match(source, /<PageErrorMessage\s+severity="empty"/);
  assert.match(source, /title=\{intl\.formatMessage\(messages\.emptyTitle\)\}/);
  assert.match(source, /description=\{emptyMessage\}/);
  const empty = source.slice(
    source.indexOf('{isEmpty && ('),
    source.indexOf('{isEmpty && (') + 300
  );
  assert.doesNotMatch(empty, /retry=|<Button|mt-16|text-gray-300/);
  assert.match(
    rule(".page-error-message[data-severity='empty']"),
    /--page-error-message-background: color-mix\([\s\S]*var\(--palette-orange\) 35%/
  );
});

test('detail pages retain their shared title row and aggregate panel fetch activity', () => {
  const page = component('TvDetails/index.tsx');
  const layout = component('TvDetails/SeriesDetailsLayout.tsx');
  const panel = component('MediaDetails/SeriesSeasonEpisodeBrowser.tsx');
  assert.match(page, /className="page-title-row"/);
  assert.match(page, /className="page-title"/);
  assert.match(
    page,
    /seriesLoading\s*\|\|\s*ratingsLoading\s*\|\|\s*detailsLoading\s*\|\|\s*checkingBlocklist/
  );
  assert.equal((page.match(/\{pageHeading\}/g) ?? []).length, 3);
  assert.match(page, /onLoadingChange=\{setDetailsLoading\}/);
  assert.match(
    layout,
    /watchedLoading \|\|[\s\S]*standardCatalogLoading \|\|[\s\S]*highQualityCatalogLoading \|\|[\s\S]*episodesLoading/
  );
  assert.match(layout, /onLoadingChange=\{setEpisodesLoading\}/);
  for (const source of [layout, panel]) {
    assert.match(source, /onLoadingChange\?\.\(false\)/);
  }
  assert.match(panel, /onLoadingChange\?\.\(isValidating\)/);
  assert.doesNotMatch(panel, /LoadingSpinner/);
});

test('panel messages use the shared message role before content, with source-owned recovery', () => {
  const message = component('Common/PageErrorMessage/index.tsx');
  const page = component('TvDetails/index.tsx');
  const layout = component('TvDetails/SeriesDetailsLayout.tsx');
  const panel = component('MediaDetails/SeriesSeasonEpisodeBrowser.tsx');
  const tree = component('MediaDetails/SeasonEpisodeTree.tsx');
  const credits = component('MediaDetails/ExpandableCreditList.tsx');
  const messageAudit = auditTailwindClassExpressions({
    path: 'Common/PageErrorMessage/index.tsx',
    source: message,
  });
  assert.deepEqual(messageAudit.utilities, []);
  assert.match(message, /className="page-error-message"/);
  assert.match(message, /data-severity=\{severity\}/);
  assert.match(message, /className="card-title"/);
  assert.match(message, /buttonIcon="retry"/);
  assert.match(message, /aria-busy=\{busy\}/);
  assert.match(message, /disabled=\{busy\}/);
  assert.match(message, /retryActive\.current/);
  assert.match(message, /await retry\.onClick\(\)/);
  assert.match(message, /<Tooltip content=\{retry\.tooltip\}>/);
  assert.match(panel, /onClick: \(\) => mutate\(\)/);
  assert.match(page, /onClick: \(\) => revalidate\(\)/);
  assert.match(page, /error\?\.response\?\.status === 404/);
  assert.match(page, /\{error && loadErrorMessage\}/);
  assert.match(panel, /metadataRetry: MessageRetry/);
  assert.doesNotMatch(
    panel,
    /messages\.selectSeason\b|episodes\.length === 0|LoadingSpinner/
  );
  assert.match(
    panel,
    /visibleSeasons\.length === 0[\s\S]*?severity="empty"[\s\S]*?retry=\{metadataRetry\}/
  );
  assert.match(panel, /error[\s\S]*?<PageErrorMessage/);
  assert.match(panel, /feedback=\{feedback\}/);
  const headingOffset = tree.indexOf('{columnHeadings()}');
  const feedbackOffset = tree.indexOf('{feedback}');
  const viewportOffset = tree.indexOf('data-tree-part="viewport"');
  assert.ok(headingOffset >= 0);
  assert.ok(feedbackOffset > headingOffset);
  assert.ok(viewportOffset > feedbackOffset);
  assert.match(
    layout,
    /<PageErrorMessage[\s\S]*?severity="empty"[\s\S]*?retry=\{metadataRetry\}/
  );
  assert.equal((layout.match(/retry=\{metadataRetry\}/g) ?? []).length, 3);
  assert.match(layout, /metadataRetry=\{metadataRetry\}/);
  assert.match(
    credits,
    /<PageErrorMessage title=\{emptyLabel\} severity="empty" retry=\{retry\}/
  );
  assert.match(rule('.page-error-message'), /--page-error-message-text: #fff;/);
});

test('page activity shares one right-aligned status role and approved spinner styling', () => {
  const requests = component('Requests/index.tsx');
  const spinner = component('Common/LoadingSpinner/index.tsx');
  const pageSpinner = spinner.slice(
    spinner.indexOf('export const PageStatus'),
    spinner.indexOf('export const SmallLoadingSpinner')
  );
  assert.match(pageSpinner, /className="page-status"/);
  assert.match(pageSpinner, /role="status"/);
  assert.match(pageSpinner, /useSearchActivity\(\)/);
  assert.match(pageSpinner, /if \(!active && !searching\) return null/);
  assert.match(pageSpinner, /const statusLabel = searching/);
  for (const path of [
    'Common/Header/index.tsx',
    'Blocklist/index.tsx',
    'IssueList/index.tsx',
    'TvDetails/index.tsx',
    'Requests/index.tsx',
    'VisualLab/Testing.tsx',
  ]) {
    assert.match(component(path), /<PageStatus(?:\s|\s*\/)/, path);
  }
  assert.doesNotMatch(pageSpinner, /\b(?:text-|h-|w-|flex |items-|justify-)/);
  assert.match(rule('.page-status'), /color: var\(--palette-orange-light\)/);
  assert.match(
    rule('.page-status'),
    /font-size: var\(--card-title-font-size\)/
  );
  assert.match(
    rule('.movie-summary-title'),
    /font-size: var\(--card-title-font-size\)/
  );
  assert.match(rule('.page-status'), /margin-inline-start: auto/);
  assert.match(rule('.page-status svg'), /width: 1em;[\s\S]*height: 1em/);
  assert.match(rule('.page-status svg'), /color: var\(--palette-blue-light\)/);
  assert.match(rule('.page-status'), /--page-status-stroke-width: 4;/);
  assert.match(
    rule('.page-status svg :is(circle, path)'),
    /stroke-width: var\(--page-status-stroke-width\);/
  );
  assert.match(rule('.page-status svg'), /overflow: visible;/);
  assert.match(rule('.page-title-row'), /align-items: center/);
  const heading = requests.slice(
    requests.indexOf('const pageHeading ='),
    requests.indexOf('if (!data && !error)')
  );
  assert.match(heading, /className="page-title-row"/);
  assert.match(heading, /<PageStatus\s+active=\{isValidating\}/);
  assert.doesNotMatch(requests, /<LoadingSpinner/);
  assert.equal(requests.match(/\{pageHeading\}/g)?.length, 3);
});

test('overlay windows use the shared page-overlay family for backdrop, geometry and animation', () => {
  const modal = component('Common/Modal/index.tsx');
  assert.match(modal, /className="page-overlay"/);
  assert.match(modal, /'page-overlay-card'/);
  assert.doesNotMatch(modal, /app-modal-screen-backdrop/);
  assert.match(rule('.page-overlay'), /background-color: rgb\(0 0 0 \/ 0\.8\)/);
  assert.match(rule('.page-overlay'), /position: fixed;[\s\S]*inset: 0/);
  assert.match(rule('.page-overlay'), /transition: opacity 300ms ease/);
  assert.match(rule('.page-overlay[data-closed]'), /opacity: 0/);
  assert.match(
    rule('.page-overlay-card'),
    /opacity 300ms ease,[\s\S]*transform 300ms ease/
  );
  assert.match(
    rule('.page-overlay-card[data-closed]'),
    /opacity: 0;[\s\S]*transform: scale\(0\.75\)/
  );
  assert.doesNotMatch(css, /\.app-modal-screen-backdrop\b/);
});

test('all overlay entry-point Transitions defer animation to the shared window family', () => {
  const collect = (directory) =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const file = new URL(
        entry.name + (entry.isDirectory() ? '/' : ''),
        directory
      );
      return entry.isDirectory()
        ? collect(file)
        : entry.name.endsWith('.tsx')
          ? [file]
          : [];
    });
  const violations = [];
  for (const file of collect(new URL('../components/', import.meta.url))) {
    const source = readFileSync(file, 'utf8');
    const ast = ts.createSourceFile(
      file.pathname,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );
    const visit = (node) => {
      if (
        ts.isJsxElement(node) &&
        node.openingElement.tagName.getText(ast) === 'Transition'
      ) {
        let ownsWindow = false;
        const findWindow = (child) => {
          if (
            ts.isJsxOpeningElement(child) ||
            ts.isJsxSelfClosingElement(child)
          ) {
            const tag = child.tagName.getText(ast);
            if (
              tag === 'Modal' ||
              tag.endsWith('Modal') ||
              tag === 'RequestActionConfirmation'
            )
              ownsWindow = true;
          }
          ts.forEachChild(child, findWindow);
        };
        node.children.forEach(findWindow);
        if (ownsWindow) {
          const customEffects =
            node.openingElement.attributes.properties.filter(
              (attribute) =>
                ts.isJsxAttribute(attribute) &&
                /^(enter|enterFrom|enterTo|leave|leaveFrom|leaveTo)$/.test(
                  attribute.name.text
                )
            );
          if (customEffects.length)
            violations.push(
              `${file.pathname}: ${customEffects.map((attribute) => attribute.name.text).join(', ')}`
            );
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
  assert.deepEqual(
    violations,
    [],
    'Overlay entry points must not override the global animation owner'
  );
});

test('all Request Status history buttons keep one stable label', () => {
  const requests = component('Requests/index.tsx');
  const softwareRequests = component('RequestStatus/SoftwareRequests.tsx');
  for (const source of [requests, softwareRequests]) {
    assert.match(source, /history: 'History'/);
    assert.doesNotMatch(
      source,
      /showHistory:|hideHistory:|Show Status History|Hide Status History/
    );
    assert.match(source, /<ClockIcon/);
    assert.match(source, /<ChevronDownIcon/);
  }
});

test('primary Request Status actions keep status first and History immediately after it', () => {
  const requests = component('Requests/index.tsx');
  const actionRow = requests.match(
    /<div className="[^"]*\brequest-status-action-row\b[^"]*">([\s\S]*?)<\/div>/
  )?.[1];
  assert.ok(actionRow, 'the primary Request Status action row must exist');

  const status = actionRow.indexOf('request-status-control');
  const history = actionRow.indexOf('messages.history');
  const requestActions = actionRow.indexOf('{actionControls}');
  const download = actionRow.indexOf('<RequestDownloadAction');

  assert.ok(status >= 0, 'the status control must be present');
  assert.ok(history > status, 'History must follow the status control');
  assert.ok(
    requestActions > history && download > history,
    'History must appear before the remaining request actions'
  );
});

test('Episode Queue assigned status uses the shared green palette', () => {
  const declaration = rules('.request-status-control-success');
  assert.ok(declaration);
  assert.match(declaration, /var\(--palette-green(?:-dark|-light)?\)/);
  assert.doesNotMatch(declaration, /var\(--palette-lime(?:-dark|-light)?\)/);
});

test('card tables retain their explicit shared header and value typography', () => {
  assert.match(
    sharedCss,
    /--card-table-font-size: var\(--interface-card-table-font-size\);/
  );
  assert.match(origThemeCss, /--interface-card-table-font-size: 0\.75rem;/);
  assert.match(ngjThemeCss, /--interface-card-table-font-size: 0\.75rem;/);
  const cardTable = rule('.card-table');
  assert.match(cardTable, /display: grid/);
  assert.match(
    cardTable,
    /grid-template-columns: var\([\s\S]*?--card-table-columns,[\s\S]*?max-content minmax\(0, 1fr\)[\s\S]*?\)/
  );
  assert.match(
    cardTable,
    /grid-auto-rows: minmax\(var\(--detail-row-height\), auto\)/
  );
  assert.match(cardTable, /row-gap: var\(--detail-row-gap\)/);
  assert.match(
    cardTable,
    /column-gap: var\(--card-table-column-gap, 0\.75rem\)/
  );
  assert.match(cardTable, /font-size: var\(--card-table-font-size\)/);
  assert.match(cardTable, /line-height: var\(--detail-row-height\)/);
  assert.match(
    css,
    /\.card-table dt,[\s\S]*?\.card-table-heading\s*\{[^}]*font-size: var\(--card-table-font-size\);[^}]*line-height: var\(--detail-row-height\);[^}]*font-weight: var\(--card-table-heading-weight\)/s
  );
  assert.match(
    css,
    /\.card-table dd,[\s\S]*?\.card-table-value\s*\{[^}]*font-size: var\(--card-table-font-size\);[^}]*line-height: var\(--detail-row-height\);[^}]*font-weight: var\(--card-table-value-weight\)/s
  );
  const requests = component('Requests/index.tsx');
  assert.equal(
    requests.match(/<(?:dl|div) className="card-table\b/g)?.length,
    3,
    'all three metadata grids must own the card-table role'
  );
  assert.doesNotMatch(requests, /<dt className="(?!card-table-heading\b)/);
  assert.doesNotMatch(requests, /<dd className="(?!card-table-value\b)/);
  assert.match(requests, /<ol className="card-table app-history-grid">/);
  assert.match(
    rule('.app-history-grid'),
    /--card-table-columns: 7rem 6rem 7\.5rem minmax\(0, 1fr\)/
  );
  assert.match(
    rules('.app-action-row'),
    /justify-content: var\(--action-row-justify\)/
  );
  assert.match(
    rule('.app-action-row.request-status-action-row'),
    /--action-row-justify: space-between/
  );
});

test('details layout variables preserve placement independently of other card tables', () => {
  const selector = '.card-table.detail-paired-columns > .card-table';
  const matchingRules = [
    ...css.matchAll(
      /\.card-table\.detail-paired-columns > \.card-table\s*\{([^}]+)\}/g
    ),
  ].map((match) => match[1]);
  assert.equal(matchingRules.length, 2);
  assert.match(matchingRules[0], /--card-table-details-group-column: 5;/);
  assert.match(
    matchingRules[0],
    /--card-table-details-group-row: 1 \/ span 3;/
  );
  assert.match(
    rule(selector),
    /grid-column: var\(--card-table-details-group-column, 1 \/ -1\);/
  );
  assert.match(
    rule(selector),
    /grid-row: var\(--card-table-details-group-row, auto\);/
  );
  assert.match(
    rule('.detail-three-column-grid'),
    /grid-template-columns: var\(\s*--card-table-details-columns,\s*var\(--card-table-default-details-columns\)\s*\);/
  );
  assert.doesNotMatch(rule('.card-table'), /--card-table-details-/);
  assert.doesNotMatch(rule('.app-history-grid'), /--card-table-details-/);
  assert.doesNotMatch(css, /--card-table-group-column/);
  assert.doesNotMatch(
    matchingRules.join('\n'),
    /grid-column: 1 \/ -1;/,
    'the mobile fallback must not override desktop group placement'
  );
});

test('software media filters persist and isolate their request category', () => {
  const requests = component('Requests/index.tsx');
  const softwareRequests = component('RequestStatus/SoftwareRequests.tsx');
  const settings = server('interfaces/api/userSettingsInterfaces.ts');
  for (const category of ['retro', 'modern', 'game']) {
    assert.match(requests, new RegExp(`\\{ value: '${category}', label:`));
    assert.match(settings, new RegExp(`'${category}'`));
  }
  assert.match(requests, /values: mediaTypeValues/);
  assert.match(requests, /category=\{softwareCategory\}/);
  assert.match(
    requests,
    /softwareCategory === undefined && \([\s\S]*?<div className="card-stack">/
  );
  assert.match(softwareRequests, /params\.set\('category', category\)/);
});

test('Request Status page-family presentation stays in shared semantic CSS', () => {
  const requests = component('Requests/index.tsx');
  const softwareRequests = component('RequestStatus/SoftwareRequests.tsx');
  const pagination = component('Common/PaginationFooter/index.tsx');
  const pinnedSections = component('Discover/PinnedFilterSection.tsx');

  for (const semanticClass of [
    '.app-detail-summary-grid',
    '.app-timeline-card',
    '.app-progress-card',
    '.app-history-card',
    '.app-page-alert',
    '.page-title',
    '.app-empty-state',
    '.app-compact-request-card',
    '.app-compact-request-history',
    '.app-action-icon',
    '.app-navigation-icon',
    '.app-disclosure-chevron',
  ]) {
    assert.ok(rule(semanticClass), `${semanticClass} must be defined globally`);
  }

  for (const [path, source] of [
    ['Requests/index.tsx', requests],
    ['RequestStatus/SoftwareRequests.tsx', softwareRequests],
    ['Common/PaginationFooter/index.tsx', pagination],
    ['Discover/PinnedFilterSection.tsx', pinnedSections],
    [
      'Discover/MediaFilterOption.tsx',
      component('Discover/MediaFilterOption.tsx'),
    ],
    [
      'MediaDetails/DetailDisclosureButton.tsx',
      component('MediaDetails/DetailDisclosureButton.tsx'),
    ],
    [
      'Common/MediaTypeBadge/index.tsx',
      component('Common/MediaTypeBadge/index.tsx'),
    ],
  ]) {
    const violations = classNameTokens(source).filter((token) =>
      presentationUtility.test(token)
    );
    assert.deepEqual(
      violations,
      [],
      `${path} contains page-family presentation utilities: ${violations.join(', ')}`
    );
    assert.doesNotMatch(
      source,
      /<[A-Z][A-Za-z0-9]*(?:Icon)?[^>]*className="[^"]*\b(?:h|w)-\d/,
      `${path} gives a rendered component a local explicit size instead of a shared role`
    );
  }
  assert.match(requests, /app-timeline-card/);
  assert.match(requests, /app-progress-card/);
  assert.match(requests, /app-history-card/);
  assert.match(softwareRequests, /app-compact-request-card/);
});

test('Request Status buttons do not override shared padding or icon spacing', () => {
  for (const path of [
    'Requests/index.tsx',
    'RequestStatus/SoftwareRequests.tsx',
    'Common/PaginationFooter/index.tsx',
  ]) {
    const source = component(path);
    assert.doesNotMatch(
      source,
      /app-button[^'"`\n]*(?:\bgap-|\bpx-|\bp-0)/,
      path
    );
    assert.doesNotMatch(
      source,
      /<[^>]+Icon className="[^"]*\b(?:mr|ml)-\d/,
      path
    );
  }
});

test('Episode Queue uses read-only assigned status and compact generated-request badge', () => {
  for (const path of [
    'Requests/index.tsx',
    'RequestList/RequestItem/index.tsx',
  ]) {
    const source = component(path);
    assert.match(source, /watchAheadEpisodeBadge: 'Auto-Queued'/, path);
    assert.match(source, /Automatically requested by the Episode Queue/, path);
  }
  assert.match(
    component('Requests/index.tsx'),
    /watchAheadAssigned:[\s\S]*?by administrator/
  );
  assert.doesNotMatch(component('Requests/index.tsx'), /RequestListboxControl/);
  for (const path of [
    'Requests/index.tsx',
    'RequestList/RequestItem/index.tsx',
  ]) {
    assert.match(
      component(path),
      /watchAheadParentRequestId &&[\s\S]*?className="request-status-control request-status-control-success"/,
      'Automatic queue status uses the existing green standard status family'
    );
  }
});

test('approved supporting components keep Tailwind utilities out of class expressions', (context) => {
  const sources = [
    'RequestStatus/SoftwareRequests.tsx',
    'Requests/destructiveActions.tsx',
    'Common/Button/index.tsx',
    'Common/MediaTypeBadge/index.tsx',
    'Common/BookFormatBadge/index.tsx',
  ];

  for (const path of sources) {
    const report = auditTailwindClassExpressions({
      path,
      source: component(path),
    });
    assert.deepEqual(
      report.utilities,
      [],
      `${path} retains Tailwind class utilities: ${report.utilities.join(', ')}`
    );
    if (report.unresolved.length > 0) {
      context.diagnostic(
        `${path} unresolved class expressions: ${report.unresolved.join('; ')}`
      );
    }
  }

  const compactSelectPath = 'Discover/FilterPanel/CompactFilterSelect.tsx';
  const compactSelect = component(compactSelectPath);
  const ratingStart = compactSelect.indexOf('const RatingStars');
  const compactSelectWithoutRatingArtwork = compactSelect.slice(0, ratingStart);
  const compactReport = auditTailwindClassExpressions({
    path: compactSelectPath,
    source: compactSelectWithoutRatingArtwork,
  });
  assert.deepEqual(
    compactReport.utilities,
    [],
    `${compactSelectPath} non-rating controls retain Tailwind utilities: ${compactReport.utilities.join(', ')}`
  );
});

test('badge roles follow structural poster and filter placement', () => {
  const requests = component('Requests/index.tsx');
  const posterRole = requests.match(
    /const posterBadge = ([\s\S]*?);\n {2}const refreshRequestStatus/
  )?.[1];
  assert.ok(posterRole, 'the poster badge structural role must be resolvable');
  const posterVariants = [...posterRole.matchAll(/variant="([^"]+)"/g)].map(
    (match) => match[1]
  );
  assert.ok(posterVariants.length > 0);
  assert.ok(
    posterVariants.every((variant) => variant === 'card'),
    'every badge rendered over the poster must use the poster-control role'
  );
  assert.equal(
    requests.match(
      /className="detail-card-poster app-detail-poster-(?:link|frame)"[\s\S]*?<span>\s*\{posterBadge\}\s*<\/span>/g
    )?.length,
    2,
    'both linked and unlinked poster structures must host the same role'
  );

  const filterRole = requests.match(
    /<div className="app-filter-context">([\s\S]*?)<\/div>/
  )?.[1];
  assert.ok(filterRole, 'the filter-context badge role must be resolvable');
  assert.match(filterRole, /variant="inline"/);

  for (const path of [
    'Common/BookFormatBadge/index.tsx',
    'Common/MediaTypeBadge/index.tsx',
  ]) {
    const source = component(path);
    assert.doesNotMatch(source, /tailwind-merge|\btwMerge\b/, path);
    const badgeElementPattern =
      path === 'Common/BookFormatBadge/index.tsx'
        ? /<span\s+\{\.\.\.props\}\s+ref=\{ref\}\s+className=\{badgeClassName\}/
        : /<span className=\{badgeClassName\}/;
    assert.match(source, badgeElementPattern, path);
    assert.doesNotMatch(source, /tabIndex=|role="button"|<a\b/, path);
  }
  assert.match(rule('.poster-control:not(button):not(a)'), /cursor: default/);
});

test('shared dropdown menu families own one native fade effect', () => {
  assert.match(
    css,
    /:is\(\.app-dropdown-menu, \.app-filter-select-menu, \.request-listbox-menu\)\s*\{[^}]*transition-property: opacity;[^}]*transition-duration: 150ms/s
  );
  assert.match(
    css,
    /:is\([\s\S]*?\.request-listbox-menu[\s\S]*?\)\[data-closed\]\s*\{[^}]*opacity: 0/s
  );
  assert.match(
    css,
    /details\[open\] > \.app-dropdown-menu\s*\{[^}]*animation: app-dropdown-menu-enter 150ms ease-out/s
  );
  for (const path of [
    'Discover/FilterPanel/CompactFilterSelect.tsx',
    'RequestModal/AdvancedRequester/index.tsx',
  ]) {
    const source = component(path);
    assert.doesNotMatch(
      source,
      /\b(?:enter|enterFrom|enterTo|leave|leaveFrom|leaveTo)="[^"]+"/,
      path
    );
  }
});

test('Requests Tailwind audit reports every unresolved class expression honestly', (context) => {
  const report = auditTailwindClassExpressions({
    path: 'Requests/index.tsx',
    source: component('Requests/index.tsx'),
  });
  if (report.utilities.length > 0) {
    context.diagnostic(
      `Remaining Requests Tailwind utilities: ${report.utilities.join(', ')}`
    );
  } else {
    context.diagnostic(
      'Requests class expressions contain zero Tailwind utilities.'
    );
  }
  if (report.unresolved.length > 0) {
    context.diagnostic(
      `Unresolved Requests class expressions: ${report.unresolved.join('; ')}`
    );
  }
});

test('Visual Lab Testing compares retained local trees inside the actual main details card', () => {
  const testing = component('VisualLab/Testing.tsx');
  const details = component('TvDetails/index.tsx');
  const layout = component('TvDetails/SeriesDetailsLayout.tsx');
  assert.match(testing, /const pages = \[1, 6\] as const/);
  assert.match(testing, /pageTitle: 'Series Testing Page'/);
  assert.match(
    testing,
    /<PageTitle title=\{intl\.formatMessage\(messages\.pageTitle\)\} \/>/
  );
  assert.match(
    testing,
    /<h1 className="page-title">\{intl\.formatMessage\(messages\.pageTitle\)\}<\/h1>/
  );
  assert.match(testing, /@app\/components\/MediaDetails\/SeasonEpisodeTree/);
  assert.match(testing, /releaseDate: episode\.airDate \|\| undefined/);
  assert.match(testing, /data-list-width="two-thirds"/);
  assert.match(rule('.selection-tree'), /--scroll-viewport-height:\s*186px/);
  assert.match(
    rule(".app-card-inset[data-card-layout='scroll']"),
    /height:\s*var\(--scroll-viewport-height\)/
  );
  assert.match(
    rule('.scrollable-card[data-scroll-layout]'),
    /overflow-y:\s*auto/
  );
  assert.doesNotMatch(
    css,
    /data-tree-layout='(?:tiles|explorer|table|accordion|accordion-menu|folder)'/
  );
  assert.match(
    rule(".scrollable-card[data-scroll-layout='tree']"),
    /flex:\s*1;[\s\S]*min-height:\s*0;[\s\S]*height:\s*auto/
  );
  assert.doesNotMatch(
    css,
    /@container \(max-width: 540px\)|data-tree-part='metadata'/
  );
  assert.match(
    rule(".selection-tree [data-tree-part='name']"),
    /white-space:\s*nowrap/
  );
  assert.match(testing, /useRouteGuard\(Permission\.ADMIN\)/);
  assert.match(testing, /<TvDetails/);
  assert.match(testing, /seasonBrowser=\{tree\}/);
  assert.match(testing, /showRelated=\{false\}/);
  assert.match(testing, /selectedIds=\{selectedIds\}/);
  assert.match(testing, /onSelectionChange=\{setSelectedIds\}/);
  assert.match(testing, /setPage\(number\)/);
  assert.match(testing, /axios\.get<SeasonWithEpisodes>/);
  assert.doesNotMatch(
    testing,
    /axios\.(?:post|put|patch|delete)|localStorage|sessionStorage/
  );
  assert.match(testing, /target\.closest\('\[data-selection-tree\]'\)/);
  for (const attribute of [
    'onClickCapture',
    'onAuxClickCapture',
    'onKeyDownCapture',
    'onSubmitCapture',
    'onDragStartCapture',
  ]) {
    assert.ok(testing.includes(attribute + '={guardCardAction}'));
  }
  assert.match(testing, /event\.key !== 'Enter'\s*&&\s*event\.key !== ' '/);
  assert.match(details, /additionalLoading = false/);
  assert.match(layout, /showRelated = true/);
  assert.match(layout, /expandInformation = false/);
  assert.match(layout, /seasonBrowser !== undefined/);
  assert.match(layout, /<SeriesSeasonEpisodeBrowser/);
  assert.match(
    component('VisualLab/index.tsx'),
    /href="\/visual-lab\/testing"/
  );
  // Completed fixture scenarios are retired by user direction, not hidden.
  assert.doesNotMatch(
    testing,
    /fixtureMiddleware|sampleRequest|import Requests/
  );
  // Their production recovery contracts remain covered independently.
  const requests = component('Requests/index.tsx');
  assert.match(
    requests,
    /const clearFilters = \(\) => \{[\s\S]*?pushRouteQuery\(\{\}\)/
  );
  assert.match(
    requests,
    /timeFrame !== 'all' && data\.olderCount > 0[\s\S]*?onClick=\{\(\) => updateTimeFrame\('all'\)\}/
  );
});

test('Request load errors use the shared red message card and descriptive retry control', () => {
  const requests = component('Requests/index.tsx');
  const initialErrorBranch = requests.match(
    /if \(!data\) \{([\s\S]*?)\n  \}\n\n  const totalPages/
  )?.[1];
  assert.ok(initialErrorBranch, 'the initial no-data error branch must exist');
  assert.match(initialErrorBranch, /className="page-error-message"/);
  assert.match(initialErrorBranch, /<h3 className="card-title">/);
  assert.match(initialErrorBranch, /className="page-error-message-detail"/);
  assert.deepEqual(
    classNameTokens(initialErrorBranch).filter((token) =>
      presentationUtility.test(token)
    ),
    [],
    'the initial error branch must leave presentation to shared semantic classes'
  );
  assert.match(
    initialErrorBranch,
    /<Tooltip content=\{intl\.formatMessage\(messages\.retryLoadTooltip\)\}>/
  );
  assert.doesNotMatch(initialErrorBranch, /messages\.retryTooltip/);
  assert.match(initialErrorBranch, /aria-busy=\{isValidating\}/);
  assert.match(initialErrorBranch, /buttonIcon="retry"/);

  const refreshErrorBranch = requests.match(
    /\{error && \(([\s\S]*?)\n      \)\}\n\n      <PinnedFilterSection/
  )?.[1];
  assert.ok(refreshErrorBranch, 'the refresh error branch must exist');
  assert.match(
    refreshErrorBranch,
    /<Tooltip content=\{intl\.formatMessage\(messages\.retryLoadTooltip\)\}>/
  );
  assert.doesNotMatch(refreshErrorBranch, /messages\.retryTooltip/);
  assert.match(refreshErrorBranch, /className="page-error-message"/);
  assert.match(refreshErrorBranch, /data-severity="error"/);
  assert.match(refreshErrorBranch, /<h3 className="card-title">/);
  assert.match(refreshErrorBranch, /aria-busy=\{isValidating\}/);
  assert.match(refreshErrorBranch, /buttonIcon="retry"/);
  for (const severity of ['info', 'empty']) {
    assert.match(
      requests,
      new RegExp(
        `className="page-error-message"\\s+data-severity="${severity}"\\s+role="status"`
      )
    );
  }
  assert.match(
    rule('.card-title'),
    /font-size: var\(--card-title-font-size\);/
  );
  assert.match(rule('.card-title'), /font-weight: 600;/);
  const emptyBranch = requests.match(
    /\{softwareCategory === undefined && data.results.length === 0 && \(([\s\S]*?)\n      \)\}/
  )?.[1];
  assert.ok(emptyBranch);
  assert.match(emptyBranch, /<h3 className="card-title">/);
  assert.match(
    emptyBranch,
    /hasFilters \? messages\.filteredEmptyTitle : messages\.emptyTitle/
  );
  assert.match(emptyBranch, /className="page-error-message-detail"/);
  assert.match(
    emptyBranch,
    /<FilterResetButton[\s\S]*?onClick=\{clearFilters\}/
  );
  assert.match(
    rule(".page-error-message[data-severity='empty']"),
    /--page-error-message-border: var\(--palette-orange-light\);/
  );
  assert.match(
    rule(".page-error-message[data-severity='info']"),
    /--page-error-message-background: color-mix\(\s*in srgb,\s*var\(--palette-yellow\) 35%,\s*transparent\s*\);/
  );
  assert.match(
    rule(".page-error-message[data-severity='info']"),
    /--page-error-message-border: var\(--palette-yellow-light\);/
  );

  const messageRule = rule('.page-error-message');
  assert.match(
    messageRule,
    /--page-error-message-background: color-mix\(\s*in srgb,\s*var\(--palette-red\) 35%,\s*transparent\s*\);/
  );
  assert.match(
    messageRule,
    /--page-error-message-border: var\(--palette-red-light\);/
  );
  assert.match(messageRule, /--page-error-message-text: #fff;/);
  assert.match(messageRule, /color: var\(--page-error-message-text\);/);
  assert.match(
    messageRule,
    /--page-error-message-padding: var\(--main-card-padding\);/
  );
  assert.match(messageRule, /--page-error-message-gap: var\(--card-spacing\);/);
  assert.match(
    messageRule,
    /--page-error-message-margin: var\(--card-spacing\) 0;/
  );
  assert.match(messageRule, /width: fit-content;/);
  assert.match(messageRule, /max-width: 100%;/);
  assert.match(messageRule, /flex-direction: column;/);
  assert.doesNotMatch(rules('.page-error-message'), /flex-direction: row;/);
  assert.match(rule('.page-error-message .card-title'), /color: inherit;/);
  assert.match(rule('.page-error-message-detail'), /color: inherit;/);
  assert.match(
    css,
    /\.app-button\[data-button-icon='retry'\]\[aria-busy='true'\] > span > svg \{[\s\S]*?animation: app-button-retry-spin 1s linear infinite;/
  );
  assert.match(
    css,
    /@keyframes app-button-retry-spin \{[\s\S]*?transform: rotate\(360deg\);/
  );
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.app-button\[data-button-icon='retry'\]\[aria-busy='true'\] > span > svg \{[\s\S]*?animation: none;/
  );
});

test('Retry buttons share their icon and busy animation through the global Button role', () => {
  const button = component('Common/Button/index.tsx');
  assert.match(
    button,
    /buttonIcon\?: 'cancel' \| 'browse' \| 'delete' \| 'retry'/
  );
  assert.equal(
    (button.match(/data-button-icon=\{buttonIcon\}/g) ?? []).length,
    2
  );
  assert.equal(
    (
      button.match(
        /buttonIcon === 'retry' && <ArrowPathIcon aria-hidden="true"/g
      ) ?? []
    ).length,
    2
  );
  for (const path of ['Requests/index.tsx', 'RequestCard/index.tsx']) {
    const source = component(path);
    assert.match(source, /buttonIcon="retry"\s+aria-busy=\{isRetrying\}/);
    assert.doesNotMatch(source, /animationDirection: 'reverse'/);
  }
});

test('card copy uses global subheading and body roles', () => {
  const source = component('TvDetails/SeriesDetailsLayout.tsx');
  assert.match(source, /<p className="card-subheading">\s*\{data.tagline\}/);
  assert.match(source, /<p className="card-body-text">\s*\{data.overview/);
  assert.match(
    rule('.card-subheading'),
    /font-size: var\(--card-subheading-font-size\)/
  );
  assert.match(rule('.card-subheading'), /font-weight: 400/);
  assert.match(rule('.card-subheading'), /font-style: italic/);
  assert.match(
    rule('.card-subheading'),
    /color: rgb\(var\(--color-indigo-300\)\)/
  );
  assert.match(
    rule('.card-subheading'),
    /margin: var\(--card-subheading-spacing-before\) 0 0/
  );
  assert.match(
    rule('.card-body-text'),
    /margin: var\(--card-body-spacing-before\) 0 0/
  );
  assert.match(
    rule('.card-body-text'),
    /font-size: var\(--card-body-font-size\)/
  );
  assert.match(rule('.card-body-text'), /font-weight: 400/);
  for (const selector of ['.card-subheading', '.card-body-text']) {
    assert.match(rule(selector), /line-height: var\(--card-copy-line-height\)/);
  }
});

test('compact cards change size and retain shared text spacing/style', () => {
  const source = component('MediaDetails/ExpandableCreditList.tsx');
  const normalizedSharedCss = sharedCss.replace(/\s+/g, '');
  assert.match(
    source,
    /<Link[^>]*className="card-title"[^>]*>\s*\{credit.name\}/
  );
  assert.match(source, /<span className="card-subheading">\s*\{credit.role\}/);
  assert.match(source, /data-card-size="compact"/);
  assert.match(source, /data-card-layout="portrait"/);
  const compactRule = rule(".app-card-main[data-card-size='compact']");
  assert.match(
    compactRule,
    /--card-title-font-size: var\(--card-compact-title-font-size\)/
  );
  assert.match(
    compactRule,
    /--card-subheading-font-size: var\(--card-compact-subheading-font-size\)/
  );
  assert.doesNotMatch(
    compactRule,
    /(?:^|\n)\s*(?:font|color|margin|padding|line-height|display|gap)[-:]/
  );
  assert.match(
    sharedCss,
    /--card-compact-title-font-size: var\(--interface-card-compact-title-font-size\)/
  );
  assert.match(
    normalizedSharedCss,
    /--card-compact-subheading-font-size:var\(--interface-card-compact-subheading-font-size\)/
  );
  assert.match(
    normalizedSharedCss,
    /--card-subheading-spacing-before:var\(--interface-card-subheading-spacing-before\)/
  );
  assert.doesNotMatch(
    compactRule,
    /(?:^|\n)\s*--card-subheading-spacing-before\s*:/
  );
  assert.doesNotMatch(
    source,
    /className="[^\"]*(?:truncate text-xs|line-clamp-2 text-xs)/
  );
});

test('person-card second lines are plain text outside the person link', () => {
  const source = component('MediaDetails/ExpandableCreditList.tsx');
  const file = ts.createSourceFile(
    'credit.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  let roles = 0;
  const visit = (node) => {
    if (
      ts.isJsxOpeningElement(node) &&
      node.attributes.properties.some(
        (attribute) =>
          ts.isJsxAttribute(attribute) &&
          attribute.name.getText(file) === 'className' &&
          attribute.initializer &&
          ts.isStringLiteral(attribute.initializer) &&
          attribute.initializer.text === 'card-subheading'
      )
    ) {
      roles++;
      for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) {
        if (ts.isJsxElement(ancestor)) {
          assert.ok(
            !['Link', 'a'].includes(
              ancestor.openingElement.tagName.getText(file)
            ),
            'Second-line prose must not be inside a clickable person link'
          );
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  assert.equal(roles, 1);
});

test('compact portrait cards share the fixed 70px height and compact text styling', () => {
  const source = component('MediaDetails/ExpandableCreditList.tsx');
  const layout = rule(".app-card-sub[data-card-layout='portrait']");
  assert.match(layout, /min-height: var\(--card-min-height, 5rem\)/);
  assert.match(layout, /height: var\(--card-height, auto\)/);
  const compact = rule(".app-card-main[data-card-size='compact']").replace(
    /\s+/g,
    ' '
  );
  assert.match(
    compact,
    /--card-content-padding-block: var\(--card-compact-padding-block\)/
  );
  assert.match(compact, /--card-height: var\(--card-compact-height\)/);
  assert.match(compact, /height: var\(--card-height\)/);
  assert.match(
    compact,
    /--card-copy-line-height: var\(--card-compact-line-height\)/
  );
  assert.match(compact, /--card-min-height: var\(--card-height\)/);
  assert.doesNotMatch(compact, /calc\(/);
  assert.match(
    sharedCss,
    /--card-compact-line-height: var\(--interface-card-compact-line-height\)/
  );
  assert.match(
    sharedCss,
    /--card-compact-height: var\(--interface-card-compact-height\)/
  );
  assert.match(origThemeCss, /--interface-card-compact-height: 70px;/);
  assert.match(ngjThemeCss, /--interface-card-compact-height: 84px;/);
  assert.match(
    rule('.card-title'),
    /line-height: var\(--card-copy-line-height\)/
  );
  assert.match(
    rule('.card-subheading'),
    /line-height: var\(--card-copy-line-height\)/
  );
  assert.match(
    sharedCss,
    /--card-compact-padding-block: var\(--interface-card-compact-padding-block\)/
  );
  assert.doesNotMatch(source, /className="[^\"]*\bh-20\b/);
  assert.match(source, /data-card-part="artwork"/);
  assert.match(source, /data-card-part="content"/);
  const content = rule(
    ".app-card-sub[data-card-layout='portrait'] > [data-card-part='content']"
  );
  assert.match(
    content,
    /padding-block: var\(\s*--card-content-padding-block,\s*var\(--inset-card-padding\)\s*\)/
  );
  assert.match(content, /padding-inline: var\(--inset-card-padding\)/);
  assert.match(content, /overflow-wrap: anywhere/);
});

test('Series summary and additional details consume the shared table roles', () => {
  const source = component('TvDetails/SeriesDetailsLayout.tsx');
  assert.match(source, /className="card-table detail-paired-columns"/);
  assert.match(source, /className="card-table media-detail-column-divider"/);
  assert.match(source, /className="card-title detail-summary-title"/);
  assert.match(
    source,
    /className="app-detail-poster-frame detail-card-poster"/
  );
  assert.doesNotMatch(source, /className="card:col-start-[^\"]*"/);
  assert.doesNotMatch(source, /className="media-detail-rows[^\"]*grid-cols-/);
  assert.doesNotMatch(source, /className="font-medium text-gray-100"/);
  assert.match(
    source,
    /className="card-table-value"\s+data-wrap="true"\s+data-testid="media-details-genres"/
  );
});

test('negative, logical and important utilities are not audit blind spots', () => {
  const report = auditTailwindClassExpressions({
    path: 'fixture.tsx',
    source:
      '<div className="-mr-3 sm:-top-2 ms-2 me-1 ps-2 pe-1 !px-4 px-4! card-list" />',
  });
  assert.deepEqual(report.utilities, [
    'mr-3',
    'top-2',
    'ml-2',
    'ml-1',
    'pl-2',
    'pl-1',
    'px-4',
  ]);
  assert.deepEqual(report.unresolved, []);
});

test('detail layout and credit/table consumers use global asset roles without utilities', () => {
  for (const path of [
    'TvDetails/index.tsx',
    'TvDetails/SeriesDetailsLayout.tsx',
    'MediaDetails/SeriesSeasonEpisodeBrowser.tsx',
    'MediaDetails/SeasonEpisodeTree.tsx',
    'MediaDetails/ExpandableCreditList.tsx',
  ]) {
    const report = auditTailwindClassExpressions({
      path,
      source: component(path),
    });
    assert.deepEqual(report.utilities, [], path);
    assert.deepEqual(report.unresolved, [], path);
  }
});

test('details layout CSS module references are not mistaken for Tailwind utilities', () => {
  const report = auditTailwindClassExpressions({
    path: 'fixture.tsx',
    source:
      "import detailStyles from './MediaDetailsLayout.module.css'; <div className={detailStyles.bodyGrid} />",
  });
  assert.deepEqual(report.utilities, []);
  assert.deepEqual(report.unresolved, []);
});

test('shared table variants own columns, stacked values and footer placement', () => {
  assert.match(
    css,
    /--card-table-columns: 2rem minmax\(5\.5rem, 1fr\) 4rem 2\.5rem 2\.5rem/
  );
  assert.match(
    css,
    /--card-table-columns: 2rem 4\.5rem minmax\(0, 1fr\) 2\.5rem 2\.5rem/
  );
  assert.match(
    rule(".card-table-value[data-value-layout='stacked'] > *"),
    /display: block/
  );
  assert.match(
    rule(".card-table > [data-table-slot='footer']"),
    /grid-row: var\(--card-table-footer-row, auto\)/
  );
  assert.match(
    css,
    /\.card-table\[data-table-layout='availability'\]\s*\{\s*--card-table-footer-row: 5/
  );
});

test('shared list and scroll roles preserve approved compact geometry', () => {
  const source = component('MediaDetails/ExpandableCreditList.tsx');
  assert.match(source, /className="card-list scrollable-card"/);
  assert.match(source, /data-list-layout="portrait"/);
  assert.match(source, /data-scroll-layout="portrait"/);
  assert.match(rule('.card-list'), /gap: var\(--card-spacing\)/);
  assert.match(
    rule('.scrollable-card[data-scroll-layout]'),
    /padding-inline-end: var\(--inset-card-padding\)/
  );
  assert.match(
    sharedCss,
    /--card-compact-height: var\(--interface-card-compact-height\)/
  );
  assert.match(origThemeCss, /--interface-card-compact-height: 70px;/);
  assert.match(ngjThemeCss, /--interface-card-compact-height: 84px;/);
});

test('action rows and state icons own spacing and palette globally', () => {
  const request = component('RequestButton/index.tsx');
  assert.doesNotMatch(request, /className\s*=\s*['"]ml-2['"]/);
  for (const selector of [
    '.media-primary-action-row',
    '.media-request-action-row',
  ]) {
    assert.match(rule(selector), /justify-content: var\(--action-row-justify,/);
  }
  assert.match(
    rule(".media-availability-cell[data-availability='full']"),
    /var\(--palette-green-light\)/
  );
  assert.match(
    rule(".media-availability-cell[data-availability='missing']"),
    /var\(--palette-red-light\)/
  );
  assert.match(
    rule(".app-button svg[data-icon-tone='accent']"),
    /var\(--button-icon-accent-color, var\(--palette-yellow-light\)\)/
  );
});

test('segmented filters keep the outward focus ring', () => {
  for (const path of [
    'Blocklist/index.tsx',
    'Discover/BookFormatTabs/index.tsx',
    'Discover/DiscoverMediaTabs.tsx',
    'Discover/MediaFilterOption.tsx',
    'IssueList/index.tsx',
    'Requests/index.tsx',
    'Search/index.tsx',
  ]) {
    const source = component(path);
    assert.match(source, /app-filter-segment-focus/, path);
    assert.doesNotMatch(source, /focus:ring-inset/, path);
  }
});
