import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const filename =
  process.env.SEASON_TREE_SOURCE ??
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../components/MediaDetails/SeasonEpisodeTree.tsx'
  );
const source = fs.readFileSync(filename, 'utf8');
const ast = ts.createSourceFile(
  filename,
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);
const helper = (name, dependencies = {}) => {
  const statement = ast.statements.find(
    (node) =>
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some(
        (declaration) => declaration.name.getText(ast) === name
      )
  );
  const initializer = statement.declarationList.declarations
    .find((declaration) => declaration.name.getText(ast) === name)
    .initializer.getText(ast);
  const javascript = ts.transpileModule(`const result = (${initializer});`, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  return new Function(
    ...Object.keys(dependencies),
    `${javascript}\nreturn result;`
  )(...Object.values(dependencies));
};
const isTreeEpisodeSelectable = helper('isTreeEpisodeSelectable');
const selectionDependencies = { isTreeEpisodeSelectable };
const seasonSelection = helper('seasonSelection', selectionDependencies);
const toggleSeasonSelection = helper(
  'toggleSeasonSelection',
  selectionDependencies
);
const formatTreeNumber = helper('formatTreeNumber');
const season = {
  seasonNumber: 1,
  name: 'Season 1',
  episodes: [
    { id: 10, available: true },
    { id: 11, available: false },
    { id: 12, available: true },
  ],
};

test('tree identifiers use at least two digits without truncating larger values', () => {
  for (const [value, expected] of [
    [0, '00'],
    [1, '01'],
    [9, '09'],
    [10, '10'],
    [100, '100'],
  ])
    assert.equal(formatTreeNumber(value), expected);
  const testingFile =
    process.env.SEASON_TREE_TESTING ??
    path.resolve(path.dirname(filename), '../VisualLab/Testing.tsx');
  const testingSource = fs.readFileSync(testingFile, 'utf8');
  const testingAst = ts.createSourceFile(
    testingFile,
    testingSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  let formatsSeasonNames = false;
  let pageNumbers;
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(testingAst) === 'pages'
    ) {
      const array = ts.isAsExpression(node.initializer)
        ? node.initializer.expression
        : node.initializer;
      assert.ok(ts.isArrayLiteralExpression(array));
      pageNumbers = array.elements.map((element) =>
        Number(element.getText(testingAst))
      );
    }
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(testingAst) === 'name' &&
      node.initializer.getText(testingAst).includes('formatTreeNumber(')
    )
      formatsSeasonNames = true;
    ts.forEachChild(node, visit);
  };
  visit(testingAst);
  assert.deepEqual(
    pageNumbers,
    [1, 6],
    'The rejected option is removed without renumbering retained choices.'
  );
  assert.ok(
    formatsSeasonNames,
    'The season-name data adapter must use the same global number formatter.'
  );
});

test('a season selects available episodes only and preserves other seasons', () => {
  assert.deepEqual(toggleSeasonSelection(season, [99]), [99, 10, 12]);
});
test('partial season selection completes without duplicate IDs', () => {
  assert.deepEqual(toggleSeasonSelection(season, [10]), [10, 12]);
  assert.deepEqual(seasonSelection(season, [10]), {
    disabled: false,
    selected: false,
    partial: true,
    count: 1,
  });
});
test('complete season selection toggles off without affecting other seasons', () => {
  assert.deepEqual(toggleSeasonSelection(season, [10, 12, 99]), [99]);
  assert.equal(seasonSelection(season, [10, 12]).selected, true);
});
test('empty or wholly unavailable seasons are disabled and not selected', () => {
  for (const episodes of [[], [{ id: 11, available: false }]]) {
    assert.deepEqual(seasonSelection({ ...season, episodes }, [11]), {
      disabled: true,
      selected: false,
      partial: false,
      count: 0,
    });
    assert.deepEqual(
      toggleSeasonSelection({ ...season, episodes }, [99]),
      [99]
    );
  }
});
test('selection helpers do not mutate input arrays', () => {
  const selected = [10];
  toggleSeasonSelection(season, selected);
  assert.deepEqual(selected, [10]);
  assert.deepEqual(
    season.episodes.map((episode) => episode.id),
    [10, 11, 12]
  );
});
test('explicit request eligibility is independent of library availability', () => {
  for (const [episode, expected] of [
    [{ available: true }, true],
    [{ available: false }, false],
    [{ available: true, selectable: false }, false],
    [{ available: false, selectable: true }, true],
    [{ available: true, selectable: true }, true],
    [{ available: false, selectable: false }, false],
  ])
    assert.equal(isTreeEpisodeSelectable(episode), expected);
  const requestSeason = {
    ...season,
    episodes: [
      { id: 10, available: true, selectable: false },
      { id: 11, available: false, selectable: true },
      { id: 12, available: false, selectable: false },
    ],
  };
  assert.deepEqual(toggleSeasonSelection(requestSeason, [99]), [99, 11]);
  assert.deepEqual(seasonSelection(requestSeason, [10, 11, 12]), {
    disabled: false,
    selected: true,
    partial: false,
    count: 1,
  });
  assert.deepEqual(toggleSeasonSelection(requestSeason, [99, 11]), [99]);
});
test('one baseline and one retained variant replace the rejected designs', () => {
  for (const part of ['branches', 'viewport', 'menu', 'branch'])
    assert.ok(source.includes(`'${part}'`) || source.includes(`"${part}"`));
  for (const layout of ['outline', 'amber-tree'])
    assert.ok(source.includes(`'${layout}'`));
  assert.doesNotMatch(
    source,
    /\b(?:season-grid|episode-grid|episode-pane|tree-table|tiles|explorer)\b/
  );
  assert.doesNotMatch(
    source,
    /FolderIcon|FolderOpenIcon|DocumentIcon|file-icon/
  );
  assert.doesNotMatch(
    source,
    /inline-tree|row-disclosure|episode-code|blue-ledger|expander-slot/
  );
});
test('disclosure and selection are independent keyboard-accessible buttons', () => {
  assert.ok(source.includes('aria-expanded={open}'));
  assert.ok(source.includes('aria-controls={panelId(season)}'));
  assert.ok(source.includes('const instanceId = useId()'));
  let episodeDisabled;
  const visit = (node) => {
    if (
      ts.isJsxOpeningElement(node) &&
      node.tagName.getText(ast) === 'button'
    ) {
      const attributes = node.attributes.properties;
      const role = attributes.find(
        (attribute) =>
          ts.isJsxAttribute(attribute) &&
          attribute.name.getText(ast) === 'data-tree-part'
      );
      if (role?.initializer?.getText(ast) === '"episode-selection"')
        episodeDisabled = attributes.find(
          (attribute) =>
            ts.isJsxAttribute(attribute) &&
            attribute.name.getText(ast) === 'disabled'
        )?.initializer;
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.ok(episodeDisabled && ts.isJsxExpression(episodeDisabled));
  const evaluateDisabled = new Function(
    'disabled',
    'episode',
    'isTreeEpisodeSelectable',
    `return (${episodeDisabled.expression.getText(ast)});`
  );
  for (const disabled of [false, true])
    for (const available of [false, true])
      for (const selectable of [undefined, false, true])
        assert.equal(
          evaluateDisabled(
            disabled,
            { available, selectable },
            isTreeEpisodeSelectable
          ),
          disabled || !(selectable ?? available)
        );
  assert.ok(source.includes('partial={state.partial}'));
  assert.ok(!source.includes('role="tree"'));
});
test('local selection, collapse and navigation cause no external mutations', () => {
  assert.ok(source.includes('onClick={() => setExpanded([])}'));
  assert.ok(source.includes('onSelectionChange([])'));
  assert.doesNotMatch(
    source,
    /\b(?:fetch|axios|localStorage|sessionStorage|useSWR|mutate)\b/
  );
});
test('rendered class values reference semantic owners only', () => {
  const classes = [];
  const visit = (node) => {
    if (ts.isJsxAttribute(node) && node.name.getText(ast) === 'className')
      classes.push(node.initializer.getText(ast));
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.ok(classes.length > 0);
  assert.doesNotMatch(
    classes.join(' '),
    /(?:\b(?:p|px|py|m|mt|w|h|text|bg|border|gap|grid-cols)-\d|\bflex\b|\brounded-)/
  );
  assert.doesNotMatch(source, /\bstyle=|@apply/);
});

test('outline branch guides terminate at the final episode elbow', () => {
  const cssPath =
    process.env.SEASON_TREE_CSS ??
    path.resolve(path.dirname(filename), '../../styles/globals.css');
  const css = fs.readFileSync(cssPath, 'utf8');
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: match[1],
    body: match[2],
  }));
  assert.doesNotMatch(
    css,
    /inline-tree|row-disclosure|episode-code|blue-ledger/
  );
  const episodeRhythmRules = rules.filter(
    (rule) =>
      rule.selector.includes('selection-tree') &&
      rule.selector.includes("[data-tree-part='episode']") &&
      !rule.selector.includes('::') &&
      /(?:line-height|padding-block):/.test(rule.body)
  );
  assert.equal(
    episodeRhythmRules.length,
    1,
    'Every layout must consume one shared episode line/padding owner.'
  );
  const episodeRhythm = episodeRhythmRules[0];
  assert.equal(
    episodeRhythm.selector
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim()
      .replace(/\s+/g, ' '),
    ".selection-tree [data-tree-part='episode']"
  );
  assert.match(
    episodeRhythm.body,
    /line-height:\s*calc\(var\(--card-table-font-size\)\s*\+\s*2px\)/
  );
  assert.match(
    episodeRhythm.body,
    /padding-block:\s*calc\(var\(--button-content-gap\)\s*\/\s*2\)/
  );
  assert.match(episodeRhythm.body, /position:\s*relative/);
  const episodeRules = rules.filter(
    (rule) =>
      rule.selector.includes('selection-tree') &&
      rule.selector.includes("[data-tree-part='episode']") &&
      !rule.selector.includes('::')
  );
  for (const rule of episodeRules)
    assert.doesNotMatch(
      rule.body,
      /position:\s*sticky/,
      'Episode rows must scroll normally within the viewport.'
    );
  const stickyTreeRules = rules.filter(
    (rule) =>
      rule.selector.includes('selection-tree') &&
      /position:\s*sticky/.test(rule.body)
  );
  assert.equal(
    stickyTreeRules.length,
    0,
    'The heading stays outside the scrolling viewport rather than overlaying rows.'
  );
  const columnHeading = rules.find(
    (rule) =>
      rule.selector.includes("[data-tree-part='column-headings']") &&
      rule.body.includes('--selection-tree-leading-column:')
  );
  assert.ok(columnHeading);
  assert.match(
    columnHeading.body,
    /--selection-tree-leading-column:\s*calc\(\s*var\(--selection-tree-selection-column\)\s*\+\s*var\(--selection-tree-heading-indent\)\s*\)/
  );
  assert.doesNotMatch(columnHeading.body, /margin-inline-start:/);
  assert.doesNotMatch(columnHeading.body, /position:\s*sticky|\btop:|z-index:/);
  assert.match(columnHeading.body, /flex-shrink:\s*0/);
  assert.match(columnHeading.body, /overflow-y:\s*hidden/);
  const sharedScrollGeometry = rules.find(
    (rule) =>
      rule.selector.includes('.scrollable-card') &&
      rule.selector.includes("[data-tree-part='column-headings']") &&
      /scrollbar-gutter:\s*stable/.test(rule.body)
  );
  assert.ok(sharedScrollGeometry, 'Heading and rows share scrollbar geometry.');
  assert.match(sharedScrollGeometry.body, /scrollbar-width:\s*thin/);
  assert.match(columnHeading.body, /border-bottom:/);
  assert.match(
    columnHeading.body,
    /padding-block-end:\s*var\(--button-content-gap\)/
  );
  assert.doesNotMatch(
    columnHeading.body,
    /(?:^|[;\n])\s*padding(?:-block|-block-start|-top):/,
    'The standard frame gap alone must separate toolbar buttons and heading contents.'
  );
  for (const rule of rules.filter((entry) =>
    entry.selector.includes("[data-tree-part='column-headings']")
  ))
    assert.doesNotMatch(
      rule.body,
      /(?:^|[;\n])\s*background(?:-color)?:/,
      'The heading row must not conceal artwork with its own backdrop.'
    );
  for (const rule of episodeRules)
    assert.doesNotMatch(
      rule.body,
      /(?:^|[;\n])\s*background(?:-color)?:/,
      'Data rows must reveal card artwork; the bounded selection owner supplies feedback.'
    );
  const selectAllAlignment = rules.filter((rule) =>
    rule.selector.includes("[data-tree-part='select-all']")
  );
  assert.equal(
    selectAllAlignment.length,
    1,
    'Select All has one generic alignment owner.'
  );
  assert.ok(!selectAllAlignment[0].selector.includes('data-tree-layout'));
  assert.doesNotMatch(
    selectAllAlignment[0].body,
    /transform:/,
    'Select All must remain inside the header background and divider.'
  );
  assert.ok(
    rules.some((rule) =>
      /--selection-tree-heading-indent:\s*var\(--selection-tree-indent\)/.test(
        rule.body
      )
    )
  );
  const guideRules = rules.filter(
    (rule) =>
      rule.selector.includes('selection-tree') &&
      rule.selector.includes("[data-tree-part='episode']") &&
      rule.selector.includes('::after')
  );
  assert.ok(
    guideRules.some(
      (rule) =>
        !rule.selector.includes(':last-child') &&
        /height:\s*100%/.test(rule.body)
    )
  );
  assert.ok(
    guideRules.some(
      (rule) =>
        rule.selector.includes(':last-child') && /height:\s*50%/.test(rule.body)
    )
  );
  for (const layout of ['outline', 'amber-tree']) {
    const selectors = guideRules.flatMap((rule) =>
      rule.selector
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split(',')
        .filter((selector) => selector.includes(`data-tree-layout='${layout}'`))
    );
    assert.ok(selectors.length >= 2);
    for (const selector of selectors)
      assert.match(
        selector,
        /\[data-tree-part='selection'\]::after/,
        'Branch guides must not compete with the shared row-highlight pseudo-element.'
      );
  }
  const outlineLists = rules.filter(
    (rule) =>
      rule.selector.includes("[data-tree-layout='outline']") &&
      rule.selector.includes("[data-tree-part='episodes']")
  );
  assert.ok(outlineLists.length > 0);
  for (const rule of outlineLists)
    assert.doesNotMatch(rule.body, /border-inline-start:/);
  assert.ok(
    rules.some(
      (rule) =>
        rule.selector.includes('selection-tree') &&
        rule.selector.includes("[data-tree-part='season']") &&
        /isolation:\s*isolate/.test(rule.body)
    )
  );
  assert.ok(
    rules.some(
      (rule) =>
        rule.selector.includes('selection-tree') &&
        rule.selector.includes("[data-tree-part='episode']") &&
        /isolation:\s*isolate/.test(rule.body)
    )
  );
  const scrollCardBody = rules.find(
    (rule) =>
      rule.selector.replace(/\/\*[\s\S]*?\*\//g, '').trim() ===
      ".app-card-inset[data-card-layout='scroll'] > [data-card-part='body']"
  );
  assert.ok(
    scrollCardBody,
    'A shared scroll-card body owns heading and viewport geometry.'
  );
  assert.match(scrollCardBody.body, /flex:\s*1/);
  assert.match(scrollCardBody.body, /min-height:\s*0/);
  assert.match(scrollCardBody.body, /display:\s*flex/);
  assert.match(scrollCardBody.body, /flex-direction:\s*column/);
  assert.doesNotMatch(scrollCardBody.body, /(?:^|[;\n])\s*(?:row-)?gap:/);
  for (const rule of rules.filter(
    (entry) =>
      entry.selector.includes('selection-tree') &&
      entry.selector.includes("[data-tree-part='count']")
  ))
    assert.doesNotMatch(rule.body, /position:\s*absolute/);
  for (const [name, value] of Object.entries({
    dark: '6 95 70',
    partial: '5 150 105',
    bright: '52 211 153',
  })) {
    const declaration = new RegExp(
      `--selection-color-${name}:\\s*${value.replaceAll(' ', '\\s+')}\\s*;`,
      'g'
    );
    assert.equal(
      [...css.matchAll(declaration)].length,
      1,
      `The existing circle palette ${name} value has one shared owner.`
    );
    assert.ok(css.includes(`rgb(var(--selection-color-${name})`));
  }
  const countColorRules = rules.filter(
    (rule) =>
      rule.selector.includes("[data-tree-part='count']") &&
      /\bcolor:/.test(rule.body)
  );
  assert.equal(countColorRules.length, 3);
  for (const rule of countColorRules) {
    assert.ok(rule.selector.includes('.selection-tree'));
    assert.ok(
      !rule.selector.includes('data-tree-layout'),
      'Count colors must not vary by theme.'
    );
    assert.match(
      rule.body,
      /color:\s*rgb\(var\(--selection-color-(?:dark|partial|bright)\)\)/
    );
  }
  assert.ok(
    countColorRules.some(
      (rule) =>
        rule.selector.includes("data-selection-state='partial'") &&
        rule.body.includes('--selection-color-partial')
    )
  );
  assert.ok(
    countColorRules.some(
      (rule) =>
        rule.selector.includes("data-selection-state='full'") &&
        rule.body.includes('--selection-color-bright')
    )
  );
  const separatorRule = rules.find((rule) =>
    rule.selector.includes("[data-tree-part='count-separator']")
  );
  assert.match(separatorRule.body, /white-space:\s*pre/);
  const episodeSelectionRule = rules.find(
    (rule) =>
      rule.selector.replace(/\/\*[\s\S]*?\*\//g, '').trim() ===
      ".selection-tree [data-tree-part='episode-selection']"
  );
  assert.ok(
    episodeSelectionRule,
    'One shared owner styles the three-cell episode selection button.'
  );
  assert.match(
    episodeSelectionRule.body,
    /grid-column:\s*1\s*\/\s*(?:4|span 3)/
  );
  assert.match(episodeSelectionRule.body, /grid-template-columns:\s*subgrid/);
  assert.match(episodeSelectionRule.body, /text-decoration:\s*none/);
  for (const rule of rules.filter(
    (entry) =>
      entry.selector.includes("[data-tree-part='episode']") &&
      entry.selector.includes("data-tree-layout='outline'")
  ))
    assert.doesNotMatch(
      rule.body,
      /border-bottom:|background-image:|background-size:/,
      'The branch layouts no longer contain a horizontal-rule decoration.'
    );
  const branchInsets = rules.find(
    (rule) =>
      rule.selector.replace(/\/\*[\s\S]*?\*\//g, '').trim() ===
        ".selection-tree [data-tree-part='episode']" &&
      rule.body.includes('--selection-highlight-inset-start:')
  );
  assert.ok(
    branchInsets,
    'Every retained layout shares the original bounded highlight owner.'
  );
  assert.match(
    branchInsets.body,
    /--selection-highlight-inset-start:\s*calc\(\s*var\(--selection-tree-selection-column\)\s*\+\s*var\(--button-content-gap\)\s*\)/
  );
  const treeDefaults = rules.find(
    (rule) =>
      rule.selector.replace(/\/\*[\s\S]*?\*\//g, '').trim() ===
      ".selection-tree [data-table-layout='selection-table']"
  );
  assert.ok(treeDefaults, 'The table variant owns its independent geometry.');
  assert.doesNotMatch(
    treeDefaults.body,
    /(?:^|[;\n])\s*(?:margin|padding|border|background|--scroll-viewport-height)\s*:/
  );
  assert.match(
    treeDefaults.body,
    /--selection-tree-episode-number-column:\s*2ch/
  );
  assert.doesNotMatch(css, /--selection-tree-highlight-overhang/);
  assert.match(
    treeDefaults.body,
    /var\(--selection-tree-episode-number-column\)/
  );
  const outlineGeometry = rules.find(
    (rule) =>
      rule.selector.includes(".selection-tree[data-tree-layout='outline']") &&
      rule.selector.includes("[data-table-layout='selection-table']") &&
      rule.body.includes('--selection-tree-episode-number-column:')
  );
  assert.match(
    outlineGeometry.body,
    /--selection-tree-episode-number-column:\s*calc\(2ch\s*\+\s*var\(--card-spacing\)\)/
  );
  assert.match(css, /--card-layout-spacing:\s*8px/);
  const numberAlignment = rules.find(
    (rule) =>
      rule.selector.includes("data-tree-layout='outline'") &&
      rule.selector.includes("[data-tree-part='number']") &&
      rule.selector.includes("[data-tree-part='number-heading']")
  );
  assert.match(numberAlignment.body, /text-align:\s*center/);
  assert.match(
    numberAlignment.body,
    /padding-inline-start:\s*var\(--button-content-gap\)/
  );
  assert.ok(source.includes('data-tree-part="number-heading"'));
  assert.match(css, /--button-content-gap:\s*0\.25rem/);
  const outlineConnector = rules.find(
    (rule) =>
      rule.selector.includes("data-tree-layout='outline'") &&
      rule.selector.includes("[data-tree-part='episode']::before")
  );
  assert.match(
    outlineConnector.body,
    /width:\s*calc\(\s*var\(--selection-tree-indent\)\s*\*\s*0\.75\s*-\s*var\(--button-content-gap\)\s*\/\s*2\s*\)/
  );
  assert.match(branchInsets.body, /--selection-highlight-inset-end:\s*0px/);
  assert.match(
    treeDefaults.body,
    /--selection-tree-selection-column:\s*var\(--detail-row-height\)/
  );
  assert.match(
    treeDefaults.body,
    /--selection-tree-episode-columns:\s*var\(\s*--selection-tree-leading-column,\s*var\(--selection-tree-selection-column\)/
  );
  const outlineSelectionColumn = rules.find(
    (rule) =>
      rule.selector.includes(".selection-tree[data-tree-layout='outline']") &&
      rule.selector.includes("[data-table-layout='selection-table']") &&
      rule.body.includes('--selection-tree-selection-column:')
  );
  assert.ok(outlineSelectionColumn);
  assert.match(
    outlineSelectionColumn.body,
    /--selection-tree-selection-column:\s*calc\(\s*var\(--detail-row-height\)\s*\+\s*var\(--button-content-gap\)\s*\)/
  );
  for (const rule of rules.filter(
    (entry) =>
      entry.selector.includes("[data-tree-part='selection']") &&
      !entry.selector.includes('::')
  ))
    assert.doesNotMatch(
      rule.body,
      /(?:width|height):/,
      'Widening the selection track must not resize its circle glyph.'
    );
  const originalFrame = rules.find(
    (rule) =>
      rule.selector.includes('.episode-focus-row::after') &&
      rule.body.includes('--selection-highlight-inset-start')
  );
  assert.ok(originalFrame);
  assert.match(
    originalFrame.body,
    /var\(--selection-highlight-inset-end,\s*0\.25rem\)/
  );
  assert.match(
    originalFrame.body,
    /var\(--selection-highlight-inset-start,\s*2\.5rem\)/
  );
  assert.match(originalFrame.body, /border-radius:\s*0\.375rem/);
  assert.ok(
    rules.some(
      (rule) =>
        rule.selector.includes(
          '.episode-focus-row:has(button:focus-visible)::after'
        ) && /box-shadow:/.test(rule.body)
    ),
    'Branch selection must retain the original row keyboard-focus treatment.'
  );
  for (const [state, opacity] of [
    ['active', '0.15'],
    ['hover', '0.12'],
  ])
    assert.ok(
      rules.some(
        (rule) =>
          rule.selector.includes(
            ".episode-focus-row[data-highlight-fill='true']"
          ) &&
          rule.selector.includes(
            state === 'active' ? "[data-active='true']" : ':hover'
          ) &&
          rule.body.includes(`rgb(var(--color-indigo-500) / ${opacity})`)
      ),
      'The original row family owns the bounded selection/hover fill.'
    );
  const amber = rules.find(
    (rule) =>
      rule.selector.replace(/\/\*[\s\S]*?\*\//g, '').trim() ===
        ".selection-tree[data-tree-layout='amber-tree']" &&
      rule.body.includes('--selection-highlight-border:')
  );
  assert.ok(amber);
  const terminalText = rules.filter(
    (rule) =>
      rule.selector.includes("data-tree-layout='amber-tree'") &&
      /font-family:/.test(rule.body)
  );
  assert.equal(terminalText.length, 1, 'One terminal typography owner.');
  assert.ok(terminalText[0].selector.includes("[data-card-part='body']"));
  assert.match(terminalText[0].body, /color:\s*var\(--selection-tree-ink\)/);
  assert.doesNotMatch(
    css,
    /\.selection-tree\[data-tree-layout='amber-tree'\]\s+\.card-table\s*\{/
  );
  assert.match(
    amber.body,
    /--selection-highlight-border:\s*var\(--palette-orange-light\)/
  );
  assert.match(
    amber.body,
    /--selection-tree-guide-color:\s*var\(--palette-blue-light\)/
  );
  assert.match(amber.body, /--selection-tree-guide-style:\s*dashed/);
  assert.doesNotMatch(amber.body, /--selection-tree-date-column:/);
  assert.equal(
    rules.some(
      (rule) =>
        rule.selector.includes("data-tree-layout='amber-tree'") &&
        rule.selector.includes("[data-table-layout='selection-table']") &&
        /--selection-tree-date-column:/.test(rule.body)
    ),
    false
  );
  assert.ok(
    rules.some((rule) => /--selection-tree-date-column:\s*18ch/.test(rule.body))
  );
  assert.doesNotMatch(
    amber.body,
    /--selection-highlight-(?:active|hover)-fill:/
  );
  for (const name of ['active-border']) {
    assert.ok(amber.body.includes(`--selection-highlight-${name}:`));
    assert.ok(
      rules.some(
        (rule) =>
          rule.selector.includes('.episode-focus-row') &&
          new RegExp(`var\\(\\s*--selection-highlight-${name},`).test(rule.body)
      ),
      `The shared focus-row family must consume the ${name} variable.`
    );
  }
  for (const rule of rules.filter(
    (entry) =>
      entry.selector.includes("data-tree-layout='amber-tree'") &&
      entry.selector.includes("[data-tree-part='frame']")
  ))
    assert.doesNotMatch(rule.body, /--app-card-frame-background:/);
  const amberDisclosure = rules.find(
    (rule) =>
      rule.selector.includes("data-tree-layout='amber-tree'") &&
      rule.selector.includes("[data-tree-part='disclosure']") &&
      /border-color:/.test(rule.body)
  );
  assert.match(
    amberDisclosure.body,
    /border-color:\s*var\(--palette-blue-light\)/
  );
  const amberConnector = rules.find(
    (rule) =>
      rule.selector.includes("data-tree-layout='amber-tree'") &&
      rule.selector.includes("[data-tree-part='episode']::before")
  );
  assert.match(
    amberConnector.body,
    /border-top:[\s\S]*dashed\s+var\(--selection-tree-guide-color\)/
  );
  assert.doesNotMatch(css, /expander-slot/);
});

test('both retained methods expand, collapse and select without external writes', async () => {
  const require = createRequire(path.resolve('package.json'));
  const React = require('react');
  const { JSDOM } = require('jsdom');
  const { createRoot } = require('react-dom/client');
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalAct = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.React,
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
  }).outputText;
  const standardButton = ({ children, title, ...props }) => {
    const buttonProps = { ...props };
    delete buttonProps.iconOnly;
    return React.createElement(
      'button',
      { type: 'button', title, ...buttonProps },
      children
    );
  };
  const sharedSelection = ({ selected, partial, disabled, label, onClick }) =>
    React.createElement('button', {
      type: 'button',
      'data-shared-selection-circle': 'true',
      disabled,
      'aria-label': label,
      'aria-pressed': partial ? 'mixed' : selected,
      onClick,
    });
  const icon = (props) => React.createElement('svg', props);
  const imports = (id) => {
    if (id === 'react') return React;
    if (id === 'react-intl') {
      const { createIntl } = require('react-intl');
      const intl = createIntl({ locale: 'en', onError: () => undefined });
      return { useIntl: () => intl };
    }
    if (id === '@app/utils/defineMessages')
      return {
        __esModule: true,
        default: (scope, definitions) =>
          Object.fromEntries(
            Object.entries(definitions).map(([key, defaultMessage]) => [
              key,
              { id: `${scope}.${key}`, defaultMessage },
            ])
          ),
      };
    if (id === '@app/i18n/globalMessages')
      return {
        __esModule: true,
        default: {
          available: { id: 'global.available', defaultMessage: 'Available' },
          notavailable: {
            id: 'global.notavailable',
            defaultMessage: 'Not Available',
          },
        },
      };
    if (id.endsWith('/Button')) return standardButton;
    if (id.endsWith('/SelectionCircle'))
      return {
        __esModule: true,
        default: sharedSelection,
        SelectionCircleIndicator: ({ selected, disabled }) =>
          React.createElement(
            'span',
            {
              className: 'selection-circle',
              'aria-hidden': true,
              'data-selected': selected,
              'data-disabled': disabled,
            },
            React.createElement('svg')
          ),
      };
    if (id.endsWith('/Tooltip'))
      return ({ children, content }) =>
        React.cloneElement(children, {
          'data-tooltip-content': String(content ?? ''),
        });
    if (id.endsWith('/MediaServerIcon'))
      return {
        __esModule: true,
        default: (props) =>
          React.createElement('svg', { className: props.className }),
        getMediaServerName: () => 'Plex',
      };
    if (
      id === '@heroicons/react/24/outline' ||
      id === '@heroicons/react/24/solid'
    )
      return new Proxy(
        {},
        {
          get: (_target, name) => (props) =>
            icon({ ...props, 'data-icon': name }),
        }
      );
    throw new Error(`Unexpected external import: ${id}`);
  };
  const loadedModule = { exports: {} };
  new Function('require', 'module', 'exports', 'React', transpiled)(
    imports,
    loadedModule,
    loadedModule.exports,
    React
  );
  const Component = loadedModule.exports.default;
  const sample = [
    {
      ...season,
      episodes: season.episodes.map((episode, index) => ({
        ...episode,
        episodeNumber: index + 1,
        name: `Episode ${index + 1}`,
        watched: index === 2 ? undefined : false,
        releaseDate: index === 0 ? '2023-07-23' : undefined,
      })),
    },
    {
      seasonNumber: 2,
      name: 'Season 2',
      episodes: [
        {
          id: 20,
          episodeNumber: 1,
          name: 'Episode 1',
          available: true,
          watched: true,
        },
      ],
    },
  ];
  let root;
  try {
    const container = document.getElementById('root');
    root = createRoot(container);
    for (const layout of [1, 6]) {
      let selected = [];
      let dataset = sample;
      let selectionChanges = 0;
      let selectionPurpose = 'playback';
      let disabled = false;
      const render = () =>
        root.render(
          React.createElement(Component, {
            key: `${layout}-${selectionPurpose}`,
            layout,
            seasons: dataset,
            mediaServerType: 'plex',
            selectionPurpose,
            disabled,
            selectedIds: selected,
            onSelectionChange: (ids) => {
              selectionChanges += 1;
              selected = ids;
              render();
            },
          })
        );
      await React.act(async () => render());
      const byLabel = (label) =>
        [...container.querySelectorAll('button')].find(
          (button) => button.getAttribute('aria-label') === label
        );
      const byText = (text) =>
        [...container.querySelectorAll('button')].find(
          (button) => button.textContent === text
        );
      const click = async (button) => {
        assert.ok(button, `Missing button in layout ${layout}`);
        await React.act(async () => button.click());
      };
      const firstPanel = () =>
        container.querySelector('[aria-label="Season 1 episodes"]');
      const episodePanels = [
        ...container.querySelectorAll('[data-tree-part="episodes"]'),
      ];
      assert.equal(episodePanels.length, sample.length);
      assert.ok(episodePanels.every((panel) => panel.hidden));
      assert.equal(
        container.querySelectorAll('[aria-expanded="false"]').length,
        sample.length
      );
      assert.equal(
        container.querySelectorAll('[aria-expanded="true"]').length,
        0
      );
      assert.equal(
        [...container.querySelectorAll('[data-tree-part="episode"]')].filter(
          (row) => !row.closest('[hidden]')
        ).length,
        0,
        'Both retained layouts initially hide every episode list.'
      );
      assert.deepEqual(selected, []);
      assert.equal(selectionChanges, 0);
      await click(byLabel('Expand Season 1'));
      assert.equal(firstPanel().hidden, false);
      assert.equal(
        container.querySelector('[aria-label="Season 2 episodes"]').hidden,
        true
      );
      assert.equal(
        container.querySelectorAll('[aria-expanded="true"]').length,
        1
      );
      assert.deepEqual(selected, []);
      assert.equal(selectionChanges, 0);
      assert.deepEqual(
        [...container.querySelector('[data-tree-part="episode"]').children].map(
          (field) => field.getAttribute('data-tree-part')
        ),
        ['episode-selection', 'release-date', 'availability', 'watched']
      );
      const firstTarget = container.querySelector(
        '[data-tree-part="episode-selection"]'
      );
      assert.equal(firstTarget.tagName, 'BUTTON');
      assert.equal(firstTarget.getAttribute('type'), 'button');
      assert.equal(firstTarget.getAttribute('aria-pressed'), 'false');
      assert.equal(firstTarget.disabled, false);
      assert.equal(
        firstTarget.querySelectorAll('button, a, input, [role="button"]')
          .length,
        0
      );
      assert.deepEqual(
        [...firstTarget.children].map((field) =>
          field.getAttribute('data-tree-part')
        ),
        ['selection', 'number', 'name']
      );
      assert.equal(
        firstTarget.querySelector(
          '[data-tree-part="selection"] .selection-circle'
        ).tagName,
        'SPAN'
      );
      assert.equal(
        container.querySelector('time').getAttribute('datetime'),
        '2023-07-23'
      );
      {
        const row = firstTarget.closest('[data-tree-part="episode"]');
        assert.ok(row.classList.contains('episode-focus-row'));
        assert.equal(row.getAttribute('data-active'), 'false');
        assert.equal(row.getAttribute('data-highlight-fill'), null);
      }
      assert.equal(
        container.querySelector('time').textContent,
        'Sun, Jul 23, 2023'
      );
      assert.equal(
        container.querySelector('time').getAttribute('aria-label'),
        'Release date: Sun, Jul 23, 2023'
      );
      assert.equal([...container.querySelectorAll('time')][1].textContent, '—');
      assert.equal(
        container.querySelector('[aria-label="Available"]').textContent,
        ''
      );
      assert.equal(
        container.querySelector('[aria-label="Not Available"]').textContent,
        ''
      );
      assert.ok(
        container.querySelector('[aria-label="Available"] svg.card-table-icon')
      );
      assert.ok(
        container.querySelector(
          '[aria-label="Not Available"] svg.card-table-icon'
        )
      );
      assert.ok(
        container.querySelector(
          '[aria-label="Watched"] svg.watched-status-icon'
        )
      );
      assert.equal(
        container.querySelector('[aria-label="Unwatched"]').textContent,
        '–'
      );
      assert.equal(
        container.querySelectorAll('[data-tree-part="metadata"]').length,
        0
      );
      assert.equal(
        container.querySelector('[aria-label="Watch Status Not Available"]')
          .textContent,
        '?'
      );
      assert.equal(container.querySelectorAll('.app-card-inset').length, 1);
      assert.equal(container.querySelectorAll('.scrollable-card').length, 1);
      assert.equal(
        container.querySelector('[data-tree-part="toolbar"]').parentElement,
        container.querySelector('[data-tree-part="frame"]')
      );
      const toolbarButtons = container.querySelectorAll(
        '[data-tree-part="toolbar"] button'
      );
      assert.equal(toolbarButtons.length, 3);
      assert.equal(
        container.querySelectorAll(
          '[data-tree-part="season"] [data-icon="PlusIcon"], [data-tree-part="season"] [data-icon="MinusIcon"]'
        ).length,
        0,
        'Bulk plus/minus icons must not return to the season expansion controls.'
      );
      for (const [index, iconName] of [
        'PlusIcon',
        'MinusIcon',
        'NoSymbolIcon',
      ].entries()) {
        const actionIcon = toolbarButtons[index].querySelector('svg');
        assert.ok(actionIcon.classList.contains('app-action-icon'));
        assert.equal(actionIcon.getAttribute('data-icon'), iconName);
        assert.equal(actionIcon.getAttribute('aria-hidden'), 'true');
      }
      for (const button of toolbarButtons)
        assert.equal(button.getAttribute('buttonType'), 'prowlarr');
      assert.ok(
        container.querySelector(
          '[data-tree-part="frame"].app-card-inset [data-tree-part="viewport"].scrollable-card'
        )
      );
      assert.equal(
        container
          .querySelector('[data-tree-part="viewport"]')
          .classList.contains('app-card-inset'),
        false
      );
      assert.equal(
        container
          .querySelector('[data-tree-part="frame"]')
          .getAttribute('data-card-layout'),
        'scroll'
      );
      if ([1, 6].includes(layout))
        assert.ok(
          container.querySelector(
            '[aria-label="Media Server Watch Status"] .watched-status-logo'
          )
        );
      assert.equal(
        container
          .querySelector('[data-tree-part="viewport"]')
          .getAttribute('data-scroll-layout'),
        'tree'
      );
      assert.equal(
        container.querySelectorAll('[data-tree-part="viewport"]').length,
        1
      );
      assert.equal(
        container.querySelectorAll('[data-tree-part="toolbar"] h3').length,
        0
      );
      assert.equal(
        container
          .querySelector('[data-tree-part="toolbar"]')
          .firstElementChild.getAttribute('data-tree-part'),
        'actions'
      );
      assert.ok(!container.textContent.includes('Branch Outline'));
      assert.ok(!container.textContent.includes('Amber Tree'));
      assert.equal(
        container.querySelector('.selection-tree.card-spacing-before'),
        null,
        'The surrounding stacked card-list owns the single external card gap.'
      );
      assert.ok(
        container.querySelector(
          '[data-tree-part="frame"].refreshed-inset-surface'
        )
      );
      if (layout === 1) {
        const parent = container.querySelector('[data-tree-part="season"]');
        assert.equal(
          parent.firstElementChild.getAttribute('data-tree-part'),
          'selection'
        );
        assert.equal(parent.children[1].tagName, 'BUTTON');
        assert.ok(parent.children[1].hasAttribute('aria-expanded'));
        assert.equal(
          container.querySelector(
            '[data-tree-part="viewport"] [data-tree-part="branches"]'
          ).tagName,
          'UL'
        );
        assert.equal(
          container.querySelector('[data-tree-part="branches"]').tagName,
          'UL'
        );
      } else {
        assert.equal(container.querySelectorAll('.app-card-inset').length, 1);
        assert.equal(container.querySelectorAll('.scrollable-card').length, 1);
        assert.equal(
          container
            .querySelector('[data-tree-part="viewport"]')
            .getAttribute('data-scroll-layout'),
          'tree'
        );
        assert.equal(
          container.querySelectorAll('[data-tree-part="menu"]').length,
          1
        );
        assert.equal(
          container.querySelectorAll('[data-tree-part="branch"]').length,
          2
        );
      }
      if ([1, 6].includes(layout)) {
        const headings = container.querySelector(
          '[data-tree-part="column-headings"]'
        );
        assert.equal(
          container.querySelectorAll('[data-tree-part="column-headings"]')
            .length,
          1
        );
        assert.equal(
          headings.parentElement.getAttribute('data-card-part'),
          'body'
        );
        assert.equal(
          headings.parentElement.getAttribute('data-table-layout'),
          'selection-table'
        );
        assert.equal(headings.closest('[data-tree-part="viewport"]'), null);
        assert.equal(
          headings.nextElementSibling,
          container.querySelector('[data-tree-part="viewport"]')
        );
        assert.equal(
          headings.parentElement.parentElement,
          container.querySelector('[data-tree-part="frame"]')
        );
        assert.equal(
          container.querySelector('[data-tree-part="viewport"]').parentElement,
          headings.parentElement
        );
        assert.equal(headings.children.length, 6);
        for (const field of [...headings.children].slice(1))
          assert.ok(field.getAttribute('data-tooltip-content').length > 0);
        assert.equal(
          headings.children[0].getAttribute('data-tree-part'),
          'select-all'
        );
        const selectAll = headings.children[0].querySelector('button');
        assert.equal(
          selectAll.getAttribute('data-shared-selection-circle'),
          'true'
        );
        assert.equal(
          selectAll.getAttribute('aria-label'),
          'Select all available episodes'
        );
        assert.equal(selectAll.getAttribute('aria-pressed'), 'false');
        assert.equal(selectAll.disabled, false);
        assert.ok(
          headings.children[0]
            .getAttribute('data-tooltip-content')
            .includes('collapsed seasons')
        );
        assert.equal(
          headings.children[1].getAttribute('aria-label'),
          'Episode Number'
        );
        assert.equal(headings.children[1].textContent, '#');
        assert.equal(headings.children[2].textContent, 'Title');
        assert.equal(headings.children[3].textContent, 'Release Date');
        assert.equal(
          headings.children[4].getAttribute('aria-label'),
          'Availability'
        );
        assert.equal(
          headings.children[5].getAttribute('aria-label'),
          'Media Server Watch Status'
        );
        assert.equal(
          container.querySelectorAll('[data-tree-part="episode-headings"]')
            .length,
          0
        );
      }
      assert.equal(
        container.querySelectorAll('[data-tree-part="file-icon"]').length,
        0
      );
      {
        const parent = container.querySelector('[data-tree-part="season"]');
        assert.equal(parent.children.length, 2);
        assert.equal(
          parent.firstElementChild.getAttribute('data-tree-part'),
          'selection'
        );
        assert.equal(
          parent.children[1].getAttribute('data-tree-part'),
          'disclosure'
        );
        assert.equal(
          parent.children[1].querySelector('[data-tree-part="name"]')
            .textContent,
          'Season 1:'
        );
        const ratio = parent.children[1].querySelector(
          '[data-tree-part="count"]'
        );
        assert.equal(ratio.textContent, '00/03');
        assert.equal(ratio.previousElementSibling.textContent, '  ');
        assert.equal(
          ratio.parentElement.getAttribute('data-tree-part'),
          'season-label'
        );
        assert.equal(ratio.parentElement.textContent, 'Season 1:  00/03');
        assert.equal(ratio.getAttribute('data-selection-state'), 'none');
        assert.equal(
          ratio.previousElementSibling.getAttribute('aria-hidden'),
          'true'
        );
        assert.equal(
          ratio.getAttribute('aria-label'),
          '0 of 3 episodes selected'
        );
        assert.equal(
          parent.children[1].getAttribute('aria-description'),
          '0 of 3 episodes selected'
        );
        assert.equal(
          parent.querySelector(':scope > [data-tree-part="count"]'),
          null
        );
        assert.equal(
          ratio.closest('[data-tree-part="disclosure"]'),
          parent.children[1]
        );
        if (layout === 6) {
          assert.equal(
            parent.children[1].querySelector(
              '[data-tree-part="expander-slot"], [data-icon="PlusIcon"], [data-icon="MinusIcon"]'
            ),
            null
          );
          assert.equal(parent.children[1].querySelector('svg'), null);
        }
      }
      assert.equal(
        container.querySelector(
          '[data-tree-part="episode"] [data-tree-part="number"]'
        ).textContent,
        '01'
      );
      assert.equal(firstPanel().hidden, false);
      await click(byLabel('Collapse Season 1'));
      assert.equal(firstPanel().hidden, true);
      if (layout === 6)
        assert.equal(
          byLabel('Expand Season 1').querySelector(
            '[data-tree-part="expander-slot"], svg'
          ),
          null
        );
      assert.equal(
        container.querySelector(
          '[data-tree-part="season"] [data-tree-part="disclosure"] [data-tree-part="count"]'
        ).textContent,
        '00/03'
      );
      await click(byLabel('Expand Season 1'));
      assert.equal(firstPanel().hidden, false);
      // A click targeted at the button itself covers its blank/padded hit area.
      // jsdom does not emulate browser-native Enter/Space click synthesis; the
      // native button type, focusability and pressed state are checked instead.
      for (const part of ['selection', 'number', 'name', null]) {
        const target = byLabel('Select episode 1: Episode 1');
        const before = selectionChanges;
        await click(
          part ? target.querySelector(`[data-tree-part="${part}"]`) : target
        );
        assert.equal(
          selectionChanges,
          before + 1,
          `${part ?? 'Button Space'} must toggle once.`
        );
        assert.deepEqual(selected, [10]);
        assert.equal(
          byLabel('Deselect episode 1: Episode 1').getAttribute('aria-pressed'),
          'true'
        );
        assert.equal(
          byLabel('Deselect episode 1: Episode 1')
            .closest('[data-tree-part="episode"]')
            .getAttribute('data-active'),
          'true'
        );
        await click(byLabel('Deselect episode 1: Episode 1'));
        assert.equal(selectionChanges, before + 2);
        assert.deepEqual(selected, []);
        assert.equal(
          byLabel('Select episode 1: Episode 1')
            .closest('[data-tree-part="episode"]')
            .getAttribute('data-active'),
          'false'
        );
      }
      const nativeTarget = byLabel('Select episode 1: Episode 1');
      nativeTarget.focus();
      assert.equal(document.activeElement, nativeTarget);
      assert.equal(nativeTarget.tabIndex, 0);
      const metadataBefore = selectionChanges;
      for (const part of ['release-date', 'availability', 'watched'])
        await click(
          container.querySelector(
            `[data-tree-part="episode"] [data-tree-part="${part}"]`
          )
        );
      assert.equal(selectionChanges, metadataBefore);
      assert.deepEqual(selected, []);
      await click(byLabel('Select episode 1: Episode 1'));
      assert.deepEqual(selected, [10]);
      assert.equal(
        container.querySelector(
          '[data-tree-part="season"] [data-tree-part="disclosure"] [data-tree-part="count"]'
        ).textContent,
        '01/03'
      );
      assert.equal(
        container
          .querySelector('[data-tree-part="season"] [data-tree-part="count"]')
          .getAttribute('data-selection-state'),
        'partial'
      );
      assert.equal(
        byLabel('Select available episodes in Season 1').getAttribute(
          'aria-pressed'
        ),
        'mixed'
      );
      assert.equal(byLabel('Select episode 2: Episode 2').disabled, true);
      await click(byLabel('Select episode 2: Episode 2'));
      assert.deepEqual(selected, [10]);
      const unavailableTarget = byLabel('Select episode 2: Episode 2');
      const unavailableBefore = selectionChanges;
      await click(unavailableTarget.querySelector('[data-tree-part="number"]'));
      await click(unavailableTarget.querySelector('[data-tree-part="name"]'));
      assert.equal(selectionChanges, unavailableBefore);
      assert.deepEqual(selected, [10]);
      await click(byLabel('Select available episodes in Season 1'));
      assert.deepEqual(selected, [10, 12]);
      assert.equal(
        container.querySelector(
          '[data-tree-part="season"] [data-tree-part="disclosure"] [data-tree-part="count"]'
        ).textContent,
        '02/03'
      );
      assert.equal(
        container
          .querySelector('[data-tree-part="season"] [data-tree-part="count"]')
          .getAttribute('data-selection-state'),
        'partial'
      );
      await click(byLabel('Deselect available episodes in Season 1'));
      assert.deepEqual(selected, []);
      assert.equal(
        container.querySelector(
          '[data-tree-part="season"] [data-tree-part="disclosure"] [data-tree-part="count"]'
        ).textContent,
        '00/03'
      );
      assert.equal(
        container
          .querySelector('[data-tree-part="season"] [data-tree-part="count"]')
          .getAttribute('data-selection-state'),
        'none'
      );
      await click(byText('Expand All'));
      assert.equal(
        container.querySelectorAll('[aria-expanded="true"]').length,
        2
      );
      await click(byLabel('Select available episodes in Season 2'));
      assert.deepEqual(selected, [20]);
      const otherCount = container.querySelectorAll(
        '[data-tree-part="season"] [data-tree-part="count"]'
      )[1];
      assert.equal(otherCount.textContent, '01/01');
      assert.equal(otherCount.getAttribute('data-selection-state'), 'full');
      await click(byText('Collapse All'));
      assert.equal(
        container.querySelectorAll('[aria-expanded="false"]').length,
        2
      );
      assert.deepEqual(selected, [20]);
      if ([1, 6].includes(layout)) {
        const headings = container.querySelector(
          '[data-tree-part="column-headings"]'
        );
        assert.ok(headings);
        assert.equal(headings.closest('[hidden]'), null);
        assert.equal(
          container.querySelectorAll('[data-tree-part="column-headings"]')
            .length,
          1
        );
      }
      await click(byText('Clear Selection'));
      assert.deepEqual(selected, []);
      const summary = container.querySelector(
        '[data-tree-part="selection-summary"]'
      );
      assert.ok(summary.classList.contains('card-table'));
      assert.equal(summary.tagName, 'DL');
      assert.equal(summary.firstElementChild.tagName, 'DT');
      assert.ok(
        summary.firstElementChild.classList.contains('card-table-heading')
      );
      assert.equal(summary.firstElementChild.textContent, 'Selected:');
      assert.equal(
        container.querySelector('[data-tree-part="toolbar"] .card-body-text'),
        null
      );
      assert.ok(summary.closest('[data-tree-part="frame"]'));
      assert.ok(summary.textContent.trim().startsWith('Selected:'));
      const selectedTotal = () =>
        container.querySelector('[data-tree-part="selected-total"]');
      assert.ok(selectedTotal().classList.contains('card-table-value'));
      assert.equal(selectedTotal().textContent, '00');
      for (const count of container.querySelectorAll(
        '[data-tree-part="season"] [data-tree-part="count"]'
      ))
        assert.equal(count.getAttribute('data-selection-state'), 'none');
      assert.equal(byText('Clear Selection').disabled, true);
      const allControl = () =>
        container.querySelector('[data-tree-part="select-all"] button');
      assert.equal(allControl().getAttribute('aria-pressed'), 'false');
      await click(allControl());
      assert.deepEqual(selected, [10, 12, 20]);
      assert.equal(selectedTotal().textContent, '03');
      assert.equal(allControl().getAttribute('aria-pressed'), 'true');
      assert.equal(
        allControl().getAttribute('aria-label'),
        'Deselect all available episodes'
      );
      assert.equal(
        container.querySelectorAll('[aria-expanded="false"]').length,
        2
      );
      await click(allControl());
      assert.deepEqual(selected, []);
      assert.equal(allControl().getAttribute('aria-pressed'), 'false');
      selected = [99, 10];
      await React.act(async () => render());
      assert.equal(selectedTotal().textContent, '01');
      assert.equal(allControl().getAttribute('aria-pressed'), 'mixed');
      await click(allControl());
      assert.deepEqual(selected, [99, 10, 12, 20]);
      assert.equal(allControl().getAttribute('aria-pressed'), 'true');
      await click(allControl());
      assert.deepEqual(selected, [99]);
      assert.equal(allControl().getAttribute('aria-pressed'), 'false');
      dataset = sample.map((entry) => ({
        ...entry,
        episodes: entry.episodes.map((episode) => ({
          ...episode,
          available: false,
        })),
      }));
      await React.act(async () => render());
      assert.equal(allControl().disabled, true);
      const noAvailableBefore = selectionChanges;
      await click(allControl());
      assert.equal(selectionChanges, noAvailableBefore);
      assert.deepEqual(selected, [99]);

      // Exercise the shared rendering with request eligibility rather than
      // conflating an unavailable library item with a disabled request target.
      selectionPurpose = 'request';
      dataset = sample.map((entry) => ({
        ...entry,
        episodes: entry.episodes.map((episode) => ({
          ...episode,
          available: episode.id === 10,
          selectable: episode.id === 11 || episode.id === 20,
        })),
      }));
      selected = [99];
      await React.act(async () => render());
      assert.ok(
        [...container.querySelectorAll('[data-tree-part="episodes"]')].every(
          (panel) => panel.hidden
        )
      );
      assert.equal(
        allControl().getAttribute('aria-label'),
        'Select all requestable episodes'
      );
      assert.equal(byLabel('Select episode 1: Episode 1').disabled, true);
      assert.equal(byLabel('Select episode 2: Episode 2').disabled, false);
      const requestBefore = selectionChanges;
      await click(byLabel('Select episode 1: Episode 1'));
      assert.equal(selectionChanges, requestBefore);
      assert.deepEqual(selected, [99]);
      await click(allControl());
      assert.deepEqual(selected, [99, 11, 20]);
      assert.equal(selectedTotal().textContent, '02');
      assert.equal(allControl().getAttribute('aria-pressed'), 'true');
      assert.equal(
        container.querySelector(
          '[data-tree-part="season"] [data-tree-part="count"]'
        ).textContent,
        '01/03',
        'The count denominator retains every source episode, not just requestable episodes.'
      );
      assert.ok(
        [...container.querySelectorAll('[data-tree-part="episodes"]')].every(
          (panel) => panel.hidden
        ),
        'Bulk selection does not expand collapsed seasons.'
      );
      await click(byLabel('Expand Season 1'));
      const requestTarget = byLabel('Deselect episode 2: Episode 2');
      assert.equal(requestTarget.disabled, false);
      assert.equal(
        requestTarget
          .closest('[data-tree-part="episode"]')
          .querySelector('[data-tree-part="availability"]')
          .getAttribute('aria-label'),
        'Not Available',
        'Library availability stays truthful when the episode is requestable.'
      );
      await click(requestTarget);
      assert.deepEqual(selected, [99, 20]);
      await click(byLabel('Select requestable episodes in Season 1'));
      assert.deepEqual(selected, [99, 20, 11]);

      disabled = true;
      await React.act(async () => render());
      const lockedBefore = selectionChanges;
      for (const control of [
        allControl(),
        byText('Clear Selection'),
        byLabel('Deselect requestable episodes in Season 1'),
        byLabel('Deselect requestable episodes in Season 2'),
        byLabel('Deselect episode 2: Episode 2'),
      ]) {
        assert.ok(
          control.disabled,
          'Busy request selection must disable every selection control.'
        );
        await click(control);
      }
      assert.equal(selectionChanges, lockedBefore);
      assert.deepEqual(selected, [99, 20, 11]);
      assert.equal(selectedTotal().textContent, '02');
      await click(byLabel('Collapse Season 1'));
      assert.equal(firstPanel().hidden, true);
      await click(byText('Expand All'));
      assert.equal(
        container.querySelectorAll('[aria-expanded="true"]').length,
        2
      );
      await click(byText('Collapse All'));
      assert.ok(
        [...container.querySelectorAll('[data-tree-part="episodes"]')].every(
          (panel) => panel.hidden
        )
      );
      assert.equal(selectionChanges, lockedBefore);
      assert.deepEqual(selected, [99, 20, 11]);
      assert.equal(selectedTotal().textContent, '02');
      disabled = false;
      await React.act(async () => render());
      await click(byText('Clear Selection'));
      assert.deepEqual(selected, []);
      assert.equal(selectedTotal().textContent, '00');
    }
  } finally {
    if (root) await React.act(async () => root.unmount());
    dom.window.close();
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    globalThis.IS_REACT_ACT_ENVIRONMENT = originalAct;
  }
});
