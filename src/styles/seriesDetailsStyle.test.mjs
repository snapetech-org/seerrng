import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import postcss from 'postcss';
import { auditTailwindClassExpressions } from './tailwindClassVerifier.mjs';

const source = (path) =>
  readFileSync(new URL(`../components/${path}`, import.meta.url), 'utf8');
const css = readFileSync(new URL('./globals.css', import.meta.url), 'utf8');

test('details heading-to-table spacing reuses the card gap without enlarging inset padding', () => {
  assert.match(css, /--detail-heading-gap:\s*var\(--card-spacing\)/);
  assert.doesNotMatch(css, /--detail-heading-gap:\s*\d/);
  assert.match(
    css,
    /\.detail-card-heading-spacing\s*\{\s*margin-top:\s*var\(--detail-heading-gap\)/
  );
  assert.match(
    css,
    /\.detail-summary-card\s*\{[^}]*padding:\s*var\(--inset-card-padding\)/
  );
});

test('comparison cards collapse all information sections without changing live defaults', () => {
  const testing = source('VisualLab/Testing.tsx');
  const layout = source('TvDetails/SeriesDetailsLayout.tsx');
  assert.match(testing, /\s+collapseInformation\s/);
  assert.doesNotMatch(testing, /\s+expandInformation\s/);
  assert.match(layout, /collapseInformation = false/);
  for (const setter of [
    'setShowCast',
    'setShowCrew',
    'setShowTags',
    'setShowDetails',
  ]) {
    assert.match(
      layout,
      new RegExp(`${setter}\\(\\s*!collapseInformation\\s*&&`)
    );
  }
  assert.match(
    source('TvDetails/index.tsx'),
    /collapseInformation=\{collapseInformation\}/
  );
});

test('tree comparison omits unrelated overview, disclosure controls and duplicate title only for its caller', () => {
  const testing = source('VisualLab/Testing.tsx');
  const details = source('TvDetails/index.tsx');
  const layout = source('TvDetails/SeriesDetailsLayout.tsx');
  for (const flag of [
    'showOverview',
    'showInformationControls',
    'showPageTitle',
  ]) {
    assert.ok(testing.includes(`${flag}={false}`));
  }
  for (const flag of ['showOverview', 'showInformationControls']) {
    assert.ok(details.includes(`${flag}={${flag}}`));
    assert.ok(layout.includes(`${flag} = true`));
    assert.ok(layout.includes(`{${flag} && (`));
  }
  assert.match(details, /showPageTitle = true/);
  assert.match(details, /const pageHeading = showPageTitle &&/);
  assert.match(
    testing,
    /active=\{\s*isValidating \|\| episodesLoading \|\| catalogLoading \|\| watchedLoading/
  );
});

test('embedded cards cannot extend their hit area above preceding navigation', () => {
  const testing = source('VisualLab/Testing.tsx');
  const details = source('TvDetails/index.tsx');
  const layout = source('TvDetails/SeriesDetailsLayout.tsx');
  assert.match(testing, /\s+embedded\s/);
  assert.match(testing, /className="card-spacing-before"\s+onClickCapture/);
  assert.match(details, /embedded = false/);
  assert.match(details, /embedded=\{embedded\}/);
  assert.match(layout, /embedded = false/);
  assert.match(
    layout,
    /data-page-layout=\{embedded \? 'embedded' : undefined\}/
  );
  const embeddedRule = css.match(
    /\.page-layout \[data-page-layout='embedded'\]\s*\{([^}]+)\}/
  )?.[1];
  assert.ok(embeddedRule);
  assert.match(embeddedRule, /margin:\s*0/);
  assert.match(embeddedRule, /padding:\s*0/);
  assert.match(embeddedRule, /display:\s*flow-root/);
  assert.doesNotMatch(embeddedRule, /z-index|pointer-events:\s*none|@apply/);
});

// This is a parsed source-ownership check, not a general cascade/layout engine.
// Browser-computed clipping and paint-order review remains required.
const verifyPlaybackMenuOwners = (stylesheet) => {
  const root = postcss.parse(stylesheet);
  const owned = (selector, property) => {
    const values = [];
    root.walkRules((rule) => {
      if (
        !rule.selectors.some((value) => value.replace(/\s+/g, ' ') === selector)
      )
        return;
      for (const node of rule.nodes ?? []) {
        if (node.type === 'decl' && node.prop === property)
          values.push(node.value);
      }
    });
    assert.equal(values.length, 1, `${selector} ${property} has one owner`);
    return values[0];
  };
  const open = '.media-detail-card:has(.playback-dropdown-trigger[data-open])';
  assert.equal(owned(open, 'overflow'), 'visible');
  assert.ok(Number(owned(open, 'z-index')) > 0);
  const content = "> [data-card-part='content']";
  const ordinaryContent = Number(
    owned(`.media-detail-card ${content}`, 'z-index')
  );
  const openContent = Number(owned(`${open} ${content}`, 'z-index'));
  const frame = Number(
    owned(
      ':is(.app-card-main, .app-card-sub, .app-card-inset)::after',
      'z-index'
    )
  );
  assert.ok(openContent > frame, 'open content escapes its parent frame layer');
  assert.ok(
    ordinaryContent < frame,
    'closed card retains normal frame layering'
  );
  assert.equal(
    owned('.app-dropdown-menu', 'background-color'),
    'var(--dropdown-menu-surface)',
    'menu surface consumes the shared background owner'
  );
  assert.equal(
    owned(':root', '--dropdown-menu-surface'),
    '#000',
    'shared menu surface remains opaque black'
  );
  root.walkDecls('background-color', (decl) => {
    if (decl.parent.type !== 'rule') return;
    assert.ok(
      !decl.parent.selector.includes('.media-detail-card') ||
        !decl.parent.selector.includes('.app-dropdown-menu'),
      'detail card must not duplicate the shared menu surface'
    );
  });
  assert.equal(owned('.app-action-row', 'gap'), 'var(--card-spacing)');
};

test('open playback menus share an opaque surface and escape the parent frame layer', () => {
  verifyPlaybackMenuOwners(css);
});

test('menu owner check rejects later clipping/transparency, trapped layers and duplicate gaps', () => {
  for (const [broken, diagnostic] of [
    [
      `${css}\n.media-detail-card:has(.playback-dropdown-trigger[data-open]) { overflow: hidden; }`,
      /overflow has one owner/,
    ],
    [
      `${css}\n.app-dropdown-menu { background-color: transparent; }`,
      /\.app-dropdown-menu background-color has one owner/,
    ],
    [
      css.replace(
        '--dropdown-menu-surface: #000',
        '--dropdown-menu-surface: transparent'
      ),
      /shared menu surface remains opaque black/,
    ],
    [
      css.replace(
        /z-index: 60;(\s*\}\s*\.detail-three-column-grid)/,
        'z-index: 40;$1'
      ),
      /open content escapes its parent frame layer/,
    ],
    [
      `${css}\n.app-action-row, .fixture-other-role { gap: 8px; }`,
      /\.app-action-row gap has one owner/,
    ],
  ]) {
    assert.notEqual(broken, css, 'negative fixture changes the stylesheet');
    assert.throws(() => verifyPlaybackMenuOwners(broken), diagnostic);
  }
});

test('selection and availability circles share icon bounds and circle geometry', () => {
  const selection = source('Common/SelectionCircle/index.tsx');
  assert.match(selection, /viewBox="0 0 24 24"/);
  assert.match(selection, /strokeWidth="1.5"/);
  assert.match(selection, /<circle cx="12" cy="12" r="9"/);
  for (const selector of [
    '.card-table-icon',
    '.selection-circle',
    '.selection-circle-icon',
  ]) {
    const start = css.indexOf(`\n  ${selector} {`);
    assert.ok(start >= 0);
    const declarations = css.slice(start, css.indexOf('}', start));
    assert.match(declarations, /width: var\(--detail-row-height\)/);
    assert.match(declarations, /height: var\(--detail-row-height\)/);
    assert.doesNotMatch(declarations, /@apply/);
  }
  assert.match(selection, /aria-pressed=\{partial \? 'mixed' : selected\}/);
});

test('live Series browser reuses one shared tree with role-owned width settings', () => {
  const panel = source('MediaDetails/SeriesSeasonEpisodeBrowser.tsx');
  assert.match(
    panel,
    /data-list-layout=\{contained \? undefined : 'stacked'\}/
  );
  assert.match(
    panel,
    /data-list-width=\{contained \? 'remaining' : 'two-thirds'\}/
  );
  assert.doesNotMatch(panel, /data-list-layout="panels"/);
  assert.match(css, /width: var\(--card-list-width, 100%\)/);
  assert.match(css, /--card-list-width: calc\(100% \* 2 \/ 3\)/);
  assert.match(panel, /@app\/components\/MediaDetails\/SeasonEpisodeTree/);
  assert.equal((panel.match(/<SeasonEpisodeTree\b/g) ?? []).length, 1);
  assert.match(panel, /layout=\{1\}/);
  assert.match(panel, /buildSeriesTreeData/);
  assert.match(panel, /selectedTreeEpisodeIds/);
  assert.match(panel, /treeSelectionToPlaybackIds/);
  assert.match(panel, /selectedIds=\{selectedTreeEpisodeIds\(/);
  assert.match(panel, /onSelectionChange=\{/);
  assert.match(panel, /feedback=\{feedback\}/);
  assert.doesNotMatch(
    panel,
    /data-testid="(?:season|episode)-list"|data-table-layout="(?:grouped|indexed)"/
  );
  assert.doesNotMatch(panel, /\bstyle=|@apply/);
  const layout = source('TvDetails/SeriesDetailsLayout.tsx');
  assert.match(layout, /selectedItemIds=\{selectedPlaybackItemIds\}/);
  assert.match(layout, /onSelectionChange=\{setSelectedPlaybackItemIds\}/);
  assert.match(layout, /catalog=\{playbackCatalog\}/);
  assert.match(
    layout,
    /effectiveSelectedQuality === '4k'\s*\? highQualityPlaybackCatalog\s*: standardPlaybackCatalog/
  );
  assert.match(layout, /playbackActions\?\.\(\s*effectivePlaybackItemIds,/);
  assert.match(
    layout,
    /<PlayOnDeviceButton[\s\S]*?itemIds=\{effectivePlaybackItemIds\}/
  );
  assert.match(
    layout,
    /resolveCanonicalPlaybackSelection\(\s*availablePlaybackItemIds,\s*selectedPlaybackItemIds/
  );
});

test('dropdown and collection-poster layout use semantic owners instead of utilities', () => {
  for (const path of [
    'Common/Dropdown/index.tsx',
    'Common/ButtonWithDropdown/index.tsx',
    'MediaSlider/ShowMoreCard/index.tsx',
  ]) {
    assert.deepEqual(
      [
        ...auditTailwindClassExpressions({ source: source(path), path })
          .utilities,
      ],
      [],
      path
    );
  }
  const split = source('Common/ButtonWithDropdown/index.tsx');
  assert.match(split, /data-dropdown-part="toggle-slot"/);
  assert.match(
    css,
    /\.app-dropdown \[data-dropdown-part='toggle-slot'\][\s\S]*?margin-inline-start: -1px/
  );
  assert.match(css, /\.poster-layout \[data-poster-region='mosaic'\]/);
  assert.match(css, /gap: var\(--card-spacing\)/);
});

test('media summary and disclosure tables have independently descriptive layout settings', () => {
  const series = source('TvDetails/SeriesDetailsLayout.tsx');
  const movie = source('MovieDetails/MovieDetailsLayout.tsx');
  const movieSummary = source('MediaDetails/MovieSummaryCard.tsx');
  for (const [consumer, role] of [
    [series, 'series-title-details-table'],
    [series, 'series-details-table'],
    [movieSummary, 'movie-title-details-table'],
    [movie, 'movie-details-table'],
  ]) {
    assert.equal(
      (consumer.match(new RegExp(`data-table-layout="${role}"`, 'g')) ?? [])
        .length,
      1
    );
    const body = css.match(
      new RegExp(`\\[data-table-layout='${role}'\\]\\s*\\{([^}]+)\\}`)
    )?.[1];
    assert.ok(body, role);
    assert.match(
      body,
      new RegExp(
        `--card-table-details-columns:\\s*var\\(\\s*--${role}-columns,\\s*var\\(--card-table-default-details-columns\\)`
      )
    );
    assert.doesNotMatch(
      body,
      /(?:^|[;\n])\s*(?:padding|margin|border|background|font-size|font-weight)\s*:/
    );
    assert.doesNotMatch(body, /\d+(?:px|rem)|@apply/);
  }
  assert.match(css, /--card-table-default-details-columns:\s*minmax\(0, 1fr\)/);
  assert.match(
    css,
    /--card-table-default-details-columns:\s*max-content 0\.75rem/
  );
  assert.doesNotMatch(
    css,
    /--card-table-details-columns:\s*(?:max-content|minmax|fit-content)/
  );
  // Naming configuration must not recolor cards or change disclosure behavior.
  assert.match(
    series,
    /onClick=\{\(\) => setShowDetails\(\(open\) => !open\)\}/
  );
  assert.match(
    movie,
    /onClick=\{\(\) => setShowDetails\(\(open\) => !open\)\}/
  );
});

test('media-server disclosure controls one mounted table-and-action workspace', () => {
  const layout = source('TvDetails/SeriesDetailsLayout.tsx');
  const panel = source('MediaDetails/SeriesSeasonEpisodeBrowser.tsx');
  const disclosure = source('MediaDetails/DetailDisclosureButton.tsx');
  assert.match(layout, /mediaServer: 'Media Server'/);
  assert.match(
    layout,
    /const \[showMediaServer, setShowMediaServer\] = useState\(false\)/
  );
  assert.match(
    layout,
    /label=\{intl\.formatMessage\(messages\.mediaServer\)\}[\s\S]*?<MediaServerIcon[\s\S]*?mediaServerType=\{mediaServerType\}[\s\S]*?open=\{showMediaServer\}/
  );
  assert.match(
    layout,
    /onClick=\{\(\) => setShowMediaServer\(\(open\) => !open\)\}/
  );
  assert.match(layout, /controls="series-media-server-panel"/);
  assert.match(disclosure, /aria-controls=\{controls\}/);
  assert.match(disclosure, /title=\{title\}/);
  assert.match(
    layout,
    /watchedStatus\?\.serverType \?\?\s*playbackCatalog\?\.serverType \?\?\s*currentSettings\.mediaServerType/
  );
  const workspace = layout.slice(
    layout.indexOf('id="series-media-server-panel"'),
    layout.indexOf('<div className="media-primary-action-row">')
  );
  assert.match(workspace, /className="card-layout card-spacing-before"/);
  assert.match(workspace, /data-card-layout="media-server-panel"/);
  assert.match(workspace, /hidden=\{!showMediaServer\}/);
  assert.match(workspace, /<SeriesSeasonEpisodeBrowser\s+contained/);
  assert.match(workspace, /onSelectionChange=\{setSelectedPlaybackItemIds\}/);
  assert.match(workspace, /<div data-card-part="actions">/);
  assert.match(workspace, /<MediaQualitySelect/);
  assert.match(workspace, /<div className="app-action-row">/);
  assert.match(
    workspace,
    /\{selectedPlaybackAction != null && \(\s*<div className="app-action-row">\s*\{selectedPlaybackAction\}\s*<\/div>\s*\)\}/
  );
  assert.match(
    layout,
    /const selectedPlaybackAction = selectedPlaybackIsShared\s*\? undefined\s*:\s*playbackActions\?\.\(\s*effectivePlaybackItemIds,\s*effectiveSelectedQuality === '4k'/
  );
  assert.match(
    workspace,
    /\{selectedPlaybackAction != null && \(\s*<div className="app-action-row">\s*<PlayOnDeviceButton[\s\S]*?itemIds=\{effectivePlaybackItemIds\}[\s\S]*?<\/div>\s*\)\}/
  );
  // Playback rows share the left-aligned column and standard gap.
  assert.match(
    workspace,
    /\{selectedPlaybackAction != null && \([\s\S]*?\{selectedPlaybackAction\}[\s\S]*?\{selectedPlaybackAction != null && \(\s*<div className="app-action-row">\s*<PlayOnDeviceButton/
  );
  assert.match(layout, /pinned=\{pins\.mediaServer\}/);
  assert.match(layout, /togglePinned\('mediaServer'\)/);
  assert.match(layout, /expandInformation \|\| pins\.mediaServer/);
  assert.equal((layout.match(/<MediaQualitySelect/g) ?? []).length, 1);
  assert.equal((layout.match(/<PlayOnDeviceButton/g) ?? []).length, 1);
  assert.doesNotMatch(layout, /showMediaServer && \(/);
  assert.doesNotMatch(workspace, /setSelectedPlaybackItemIds\(\[\]\)|style=/);
  assert.match(panel, /contained = false/);
  assert.match(
    panel,
    /data-list-layout=\{contained \? undefined : 'stacked'\}/
  );
  assert.match(
    panel,
    /data-list-width=\{contained \? 'remaining' : 'two-thirds'\}/
  );
  const body = css.match(
    /\.card-layout\[data-card-layout='media-server-panel'\]:not\(\[hidden\]\)\s*\{([^}]+)\}/
  )?.[1];
  assert.ok(body);
  assert.match(body, /display:\s*flex/);
  assert.match(body, /gap:\s*var\(--card-spacing\)/);
  assert.doesNotMatch(body, /margin|padding|border|background|\d+(?:px|rem)/);
  const actions = css.match(
    /\.card-layout\[data-card-layout='media-server-panel'\]\s*> \[data-card-part='actions'\]\s*\{([^}]+)\}/
  )?.[1];
  assert.ok(actions);
  assert.match(actions, /flex:\s*none/);
  assert.match(actions, /width:\s*max-content/);
  assert.match(actions, /align-items:\s*flex-start/);
  assert.match(actions, /gap:\s*var\(--card-spacing\)/);
  assert.doesNotMatch(actions, /padding|margin|\d+(?:px|rem)/);
  assert.match(
    css,
    /\.card-list\[data-list-width='remaining'\]\s*\{[^}]*--card-list-width:\s*auto;[^}]*flex:\s*1/
  );
});

test('server saved-item visual controls reuse provider/button styles without write actions', () => {
  const layout = source('TvDetails/SeriesDetailsLayout.tsx');
  const action = layout.match(
    /data-card-part="saved-item-action"[\s\S]*?<\/Tooltip>/
  )?.[0];
  assert.ok(action);
  assert.match(layout, /MediaServerType\.JELLYFIN,\s*MediaServerType\.EMBY/);
  assert.match(layout, /addToWatchlist: 'Add to Watchlist'/);
  assert.match(layout, /addToFavorites: 'Add to Favorites'/);
  assert.match(
    action,
    /buttonType="playback"\s+buttonSize="sm"\s+type="button"/
  );
  assert.match(
    action,
    /<MediaServerIcon[\s\S]*?className="playback-provider-icon"/
  );
  assert.doesNotMatch(action, /onClick|onSubmit|href=|style=|disabled/);
  const collection = layout.match(
    /data-card-part="collection-action"[\s\S]*?<\/Tooltip>/
  )?.[0];
  assert.ok(collection);
  assert.match(layout, /addToCollection: 'Add to Collection'/);
  assert.match(
    collection,
    /buttonType="playback"\s+buttonSize="sm"\s+type="button"/
  );
  assert.doesNotMatch(collection, /onClick|onSubmit|href=|style=|disabled/);
  const separation = css.match(
    /\[data-card-part='saved-item-action'\]\s*\{([^}]+)\}/
  )?.[1];
  assert.ok(separation);
  assert.match(
    separation,
    /margin-block-start:\s*calc\(\s*var\(--action-control-height\)\s*\+\s*var\(--card-spacing\)\s*\)/
  );
});

test('native action feedback cannot expand the sidebar and displace the selection tree', () => {
  const rule = css.match(
    /\/\* Native action feedback[\s\S]*?(?=\/\* Page-level spacing)/
  )?.[0];
  assert.ok(rule);
  for (const role of ['saved-item-action', 'collection-action']) {
    assert.match(rule, new RegExp(`\\[data-card-part='${role}'\\]`));
  }
  assert.match(rule, /flex-direction:\s*column/);
  assert.match(rule, /align-items:\s*inherit/);
  const feedback = rule.slice(rule.indexOf('> .page-error-message'));
  assert.match(feedback, /contain:\s*inline-size/);
  assert.match(feedback, /inline-size:\s*100%/);
  assert.match(feedback, /--page-error-message-margin:\s*0/);
  assert.match(feedback, /align-self:\s*stretch/);
  assert.doesNotMatch(rule, /\d+(?:px|rem)|position:\s*absolute|@apply/);
});

test('media-server action rows use scoped shared justification without changing ordinary rows or button geometry', () => {
  const rules = [];
  postcss.parse(css).walkRules((rule) => rules.push(rule));
  const scoped = rules.find(
    (rule) =>
      rule.selector.replace(/\s+/g, ' ').trim() ===
      ".card-layout[data-card-layout='media-server-panel'] > [data-card-part='actions'] > .app-action-row"
  );
  assert.ok(scoped);
  assert.deepEqual(
    scoped.nodes.map(({ prop, value }) => [prop, value]),
    [['--action-row-justify', 'flex-start']]
  );
  const ordinary = rules.find(
    (rule) =>
      rule.selector === '.app-action-row' &&
      rule.nodes.some((node) => node.prop === 'justify-content')
  );
  assert.ok(ordinary);
  assert.equal(
    ordinary.nodes.find((node) => node.prop === '--action-row-justify').value,
    'flex-end'
  );
});

test('shared card body copy is justified while its final line follows the reading direction', () => {
  const rules = [];
  postcss.parse(css).walkRules((rule) => rules.push(rule));
  const body = rules.find((rule) => rule.selector === '.card-body-text');
  assert.ok(body);
  const declarations = new Map(
    body.nodes.map(({ prop, value }) => [prop, value])
  );
  assert.equal(declarations.get('text-align'), 'justify');
  assert.equal(declarations.get('text-align-last'), 'start');
  assert.equal(declarations.get('font-size'), 'var(--card-body-font-size)');
  assert.equal(declarations.get('line-height'), 'var(--card-copy-line-height)');
});

test('disclosure pins retain standard padding without an asymmetric glyph offset', () => {
  const icon = css.match(/\.detail-disclosure-pin-icon\s*\{([^}]+)\}/)?.[1];
  assert.ok(icon);
  assert.match(icon, /transform:\s*rotate\(45deg\)/);
  assert.doesNotMatch(icon, /translate|margin|padding/);
  assert.match(
    css,
    /\.detail-disclosure-pin\s*\{[^}]*padding-inline:\s*var\(--button-padding-x\)/
  );
});

test('series associations, report and all rating slots share the justified action row', () => {
  const layout = source('TvDetails/SeriesDetailsLayout.tsx');
  const series = source('TvDetails/index.tsx');
  const row = layout.slice(
    layout.indexOf('<div className="media-primary-action-row">'),
    layout.indexOf('<div className="media-request-action-row">')
  );
  assert.match(
    row,
    /\{primaryActions\}\s*\{reportIssueAction\}\s*\{secondaryActions\}\s*<VideoRatings/
  );
  assert.equal((row.match(/<VideoRatings/g) ?? []).length, 1);
  assert.doesNotMatch(layout, /media-rating-row|media-primary-report-action/);
  assert.match(series, /messages\.trailer\)\}<\/span>/);
  assert.match(
    series,
    /title=\{intl\.formatMessage\(messages\.watchtrailer\)\}/
  );
  assert.match(
    css,
    /\.media-primary-action-row\s*\{[^}]*justify-content:\s*var\(--action-row-justify, space-between\)/
  );
});
