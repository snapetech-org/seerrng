import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import postcss from 'postcss';
import ts from 'typescript';

const consumers = [
  [
    'DiscoverMovieGenre/index.tsx',
    ['discover/movies/genre/[genreId]/index.tsx'],
  ],
  ['DiscoverMovieKeyword/index.tsx', ['discover/movies/keyword/index.tsx']],
  [
    'DiscoverMovieLanguage/index.tsx',
    ['discover/movies/language/[language]/index.tsx'],
  ],
  ['DiscoverTvGenre/index.tsx', ['discover/tv/genre/[genreId]/index.tsx']],
  ['DiscoverTvKeyword/index.tsx', ['discover/tv/keyword/index.tsx']],
  [
    'DiscoverTvLanguage/index.tsx',
    ['discover/tv/language/[language]/index.tsx'],
  ],
  ['DiscoverTvUpcoming.tsx', ['discover/tv/upcoming.tsx']],
  [
    'DiscoverWatchlist/index.tsx',
    [
      'discover/watchlist.tsx',
      'profile/watchlist.tsx',
      'users/[userId]/watchlist.tsx',
    ],
  ],
  ['MovieGenreList/index.tsx', ['discover/movies/genres.tsx']],
  ['TvGenreList/index.tsx', ['discover/tv/genres.tsx']],
  ['Upcoming.tsx', ['discover/movies/upcoming.tsx']],
];

const source = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const parse = (text) =>
  ts.createSourceFile(
    'source.tsx',
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
const descendants = (root, predicate) => {
  const nodes = [];
  const visit = (node) => {
    if (predicate(node)) nodes.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return nodes;
};
const elements = (root, name) =>
  descendants(
    root,
    (node) =>
      (ts.isJsxElement(node) &&
        node.openingElement.tagName.getText() === name) ||
      (ts.isJsxSelfClosingElement(node) && node.tagName.getText() === name)
  );
const opening = (element) =>
  ts.isJsxElement(element) ? element.openingElement : element;
const attribute = (element, name) =>
  opening(element).attributes.properties.find(
    (prop) => ts.isJsxAttribute(prop) && prop.name.getText() === name
  );
const imports = (root, moduleName) =>
  descendants(
    root,
    (node) =>
      ts.isImportDeclaration(node) && node.moduleSpecifier.text === moduleName
  );

const unwrap = (node) =>
  node && ts.isParenthesizedExpression(node) ? unwrap(node.expression) : node;

// Each early return is a distinct rendered state. Nested callbacks/helpers do
// not return from the page; a path falling through still needs a title owner.
const renderReturns = (statement, headerName) => {
  if (ts.isReturnStatement(statement))
    return { expressions: [statement.expression], fallsThrough: false };
  if (ts.isIfStatement(statement)) {
    const yes = renderReturns(statement.thenStatement, headerName);
    const no = statement.elseStatement
      ? renderReturns(statement.elseStatement, headerName)
      : { expressions: [], fallsThrough: true };
    return {
      expressions: [...yes.expressions, ...no.expressions],
      fallsThrough: yes.fallsThrough || no.fallsThrough,
    };
  }
  if (ts.isBlock(statement)) {
    const expressions = [];
    let fallsThrough = true;
    for (const child of statement.statements) {
      if (!fallsThrough) break;
      const next = renderReturns(child, headerName);
      expressions.push(...next.expressions);
      fallsThrough = next.fallsThrough;
    }
    return { expressions, fallsThrough };
  }
  assert.equal(
    elements(statement, headerName).length,
    0,
    'title rendering must use a traced return or JSX expression'
  );
  return { expressions: [], fallsThrough: true };
};

const pageExpressions = (root, headerName = 'Header') => {
  const exported = root.statements.find(ts.isExportAssignment);
  if (!exported) {
    assert.equal(
      root.statements.length,
      1,
      'fixture has one render expression'
    );
    assert.ok(ts.isExpressionStatement(root.statements[0]));
    return [root.statements[0].expression];
  }
  let component = unwrap(exported.expression);
  if (ts.isIdentifier(component)) {
    const declaration = descendants(
      root,
      (node) =>
        ts.isVariableDeclaration(node) && node.name.getText() === component.text
    )[0];
    component = unwrap(declaration?.initializer);
  }
  assert.ok(
    component && ts.isArrowFunction(component),
    'trace the exported page'
  );
  if (!ts.isBlock(component.body)) return [component.body];
  const { expressions, fallsThrough } = renderReturns(
    component.body,
    headerName
  );
  return fallsThrough ? [...expressions, undefined] : expressions;
};

// Sum siblings, but keep ternary/logical alternatives separate so mutually
// exclusive owners pass and simultaneous or conditionally missing owners fail.
const titleCounts = (expression, headerName) => {
  const node = unwrap(expression);
  if (!node) return [0];
  if (ts.isConditionalExpression(node))
    return [
      ...titleCounts(node.whenTrue, headerName),
      ...titleCounts(node.whenFalse, headerName),
    ];
  if (ts.isBinaryExpression(node)) {
    const operator = node.operatorToken.kind;
    if (operator === ts.SyntaxKind.AmpersandAmpersandToken)
      return [0, ...titleCounts(node.right, headerName)];
    if (
      operator === ts.SyntaxKind.BarBarToken ||
      operator === ts.SyntaxKind.QuestionQuestionToken
    )
      return [
        ...titleCounts(node.left, headerName),
        ...titleCounts(node.right, headerName),
      ];
  }
  if (ts.isJsxExpression(node)) return titleCounts(node.expression, headerName);
  if (
    ts.isJsxElement(node) ||
    ts.isJsxSelfClosingElement(node) ||
    ts.isJsxFragment(node)
  ) {
    const isElement = !ts.isJsxFragment(node);
    const classValue = isElement
      ? attribute(node, 'className')?.initializer
      : undefined;
    const classExpression =
      classValue && ts.isJsxExpression(classValue)
        ? unwrap(classValue.expression)
        : classValue;
    const tokens =
      classExpression && ts.isStringLiteralLike(classExpression)
        ? classExpression.text.split(/\s+/)
        : [];
    const owner =
      isElement &&
      (opening(node).tagName.getText() === headerName ||
        tokens.includes('page-title'));
    let counts = [owner ? 1 : 0];
    for (const child of node.children ?? []) {
      const alternatives = titleCounts(child, headerName);
      counts = counts.flatMap((count) =>
        alternatives.map((next) => count + next)
      );
    }
    return [...new Set(counts)];
  }
  assert.equal(
    elements(node, headerName).length,
    0,
    'untraced dynamic title rendering'
  );
  return [0];
};

const assertNeutralHeaderWrapper = (text) => {
  const root = parse(text);
  const headerName =
    imports(root, '@app/components/Common/Header')[0]?.importClause?.name
      ?.text ?? 'Header';
  for (const expression of pageExpressions(root, headerName)) {
    if (
      expression &&
      ts.isJsxSelfClosingElement(unwrap(expression)) &&
      unwrap(expression)
        .tagName.getText()
        .match(/^(ErrorPage|LoadingSpinner)$/)
    )
      continue;
    assert.deepEqual(
      [...new Set(titleCounts(expression, headerName))],
      [1],
      'one shared visible title owner in every rendered branch'
    );
  }
  for (const header of elements(root, headerName)) {
    assert.equal(
      attribute(header, 'className'),
      undefined,
      'Header retains its shared owner'
    );
    assert.equal(
      attribute(header, 'style'),
      undefined,
      'no inline Header spacing'
    );
    // Direct fragment children need no wrapper. Existing element wrappers must
    // remain neutral; loading/error returns share the same Layout spacing.
    assert.ok(
      ts.isJsxElement(header.parent) || ts.isJsxFragment(header.parent),
      'Header belongs to a rendered container'
    );
    if (ts.isJsxElement(header.parent)) {
      assert.equal(header.parent.openingElement.tagName.getText(), 'div');
      const wrapperClassName = attribute(
        header.parent,
        'className'
      )?.initializer;
      assert.ok(
        !wrapperClassName ||
          (ts.isStringLiteralLike(wrapperClassName) &&
            wrapperClassName.text === 'app-filter-section-gap') ||
          [
            "{upstream ? 'mt-1 mb-5' : undefined}",
            "{upstream ? 'upstream-discovery-header' : undefined}",
            "{upstream ? 'upstream-watchlist-header' : undefined}",
            "{upstream ? 'mt-1 mb-5' : 'app-filter-section-gap'}",
          ].includes(wrapperClassName?.getText()),
        'wrapper adds no spacing except the section gap below the header'
      );
      assert.equal(
        attribute(header.parent, 'style'),
        undefined,
        'no inline wrapper spacing'
      );
    }
  }
};

test('shared Header retains the page-title row and its aggregate status', () => {
  const root = parse(source('components/Common/Header/index.tsx'));
  const rows = elements(root, 'div').filter(
    (node) =>
      attribute(node, 'className')?.initializer?.text === 'page-title-row'
  );
  assert.equal(rows.length, 1);
  assert.equal(
    attribute(elements(rows[0], 'h2')[0], 'className')?.initializer?.text,
    'page-title'
  );
  assert.equal(elements(rows[0], 'PageStatus').length, 1);
});

test('browser metadata and the rendered error dependency do not add a page-title owner', () => {
  for (const path of [
    'components/Common/PageTitle/index.tsx',
    'pages/_error.tsx',
  ]) {
    const root = parse(source(path));
    for (const expression of pageExpressions(root)) {
      assert.deepEqual(
        [...new Set(titleCounts(expression, 'Header'))],
        [0],
        path
      );
    }
  }
});

test('the global Layout and CSS, not Discover wrappers, own title spacing', () => {
  const root = parse(source('components/Layout/index.tsx'));
  const [main] = elements(root, 'main');
  assert.equal(attribute(main, 'className')?.initializer?.text, 'page-layout');
  assert.equal(
    descendants(
      main,
      (node) =>
        ts.isJsxExpression(node) && node.expression?.getText() === 'children'
    ).length,
    1
  );
  const css = postcss.parse(source('styles/globals.css'));
  const titleRules = [];
  css.walkRules((rule) => {
    if (rule.selector === '.page-layout .page-title-row') titleRules.push(rule);
  });
  assert.equal(titleRules.length, 1);
  const properties = Object.fromEntries(
    titleRules[0].nodes
      .filter((node) => node.type === 'decl')
      .map((node) => [node.prop, node.value])
  );
  assert.equal(properties['margin-block'], '0');
  assert.equal(
    properties['padding-block'].replace(/\s+/g, ' '),
    'var(--page-layout-title-padding-before) var(--page-layout-title-padding-after)'
  );
  assert.equal(
    titleRules[0].nodes.some((node) => node.name === 'apply'),
    false
  );
});

test('affected page entrypoints all render inside the shared page-layout branch', () => {
  const app = parse(source('pages/_app.tsx'));
  const branches = descendants(
    app,
    (node) =>
      ts.isIfStatement(node) &&
      elements(node.elseStatement ?? parse(''), 'Layout').length > 0
  );
  assert.equal(branches.length, 1);
  const [branch] = branches;
  const excludedPrefixes = [];
  const collectPrefixes = (node) => {
    if (ts.isParenthesizedExpression(node))
      return collectPrefixes(node.expression);
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.BarBarToken
    ) {
      collectPrefixes(node.left);
      collectPrefixes(node.right);
      return;
    }
    assert.ok(ts.isCallExpression(node));
    assert.equal(node.expression.getText(), 'isPathPrefix');
    assert.equal(node.arguments[0].getText(), 'router.pathname');
    assert.ok(ts.isStringLiteral(node.arguments[1]));
    excludedPrefixes.push(node.arguments[1].text);
  };
  collectPrefixes(branch.expression);
  const [layout] = elements(branch.elseStatement, 'Layout');
  assert.equal(elements(layout, 'Component').length, 1);
  for (const [consumer, routes] of consumers) {
    for (const route of routes) {
      const pathname = `/${route.replace(/(?:\/index)?\.tsx$/, '')}`;
      assert.equal(
        excludedPrefixes.some(
          (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
        ),
        false,
        route
      );
      const page = parse(source(`pages/${route}`));
      const moduleName = `@app/components/Discover/${consumer.replace(/(?:\/index)?\.tsx$/, '')}`;
      const [declaration] = imports(page, moduleName);
      assert.ok(declaration, `${route} imports the affected consumer`);
      assert.equal(
        elements(page, declaration.importClause.name.text).length,
        1,
        route
      );
    }
  }
});

for (const [consumer] of consumers) {
  test(`${consumer} delegates title spacing to its existing shared Header`, () => {
    const text = source(`components/Discover/${consumer}`);
    assert.equal(
      imports(parse(text), '@app/components/Common/Header').length,
      1
    );
    assertNeutralHeaderWrapper(text);
  });
}

test('the wrapper regression check rejects competing utilities and inline spacing', () => {
  const fixture = '<div><Header>{title}</Header></div>';
  assert.doesNotThrow(() => assertNeutralHeaderWrapper(fixture));
  for (const wrapper of [
    '<div className="mt-1 mb-5">',
    '<div className="mt-4">',
    '<div style={{ marginTop: 4 }}>',
  ]) {
    assert.throws(() =>
      assertNeutralHeaderWrapper(fixture.replace('<div>', wrapper))
    );
  }
});

test('title ownership follows exclusive page returns and conditional JSX', () => {
  assert.doesNotThrow(() =>
    assertNeutralHeaderWrapper(`
    import TitleHeader from '@app/components/Common/Header';
    const Page = () => {
      const helper = () => null;
      if (loading) return <><TitleHeader>{title}</TitleHeader><Loading /></>;
      if (error) return <><TitleHeader>{title}</TitleHeader><Error /></>;
      return <div><TitleHeader>{title}</TitleHeader><Content /></div>;
    };
    export default Page;
  `)
  );
  assert.doesNotThrow(() =>
    assertNeutralHeaderWrapper(
      '<div>{loading ? <div><Header>{title}</Header></div> : <div><Header>{title}</Header></div>}</div>'
    )
  );
});

test('title ownership rejects simultaneous, missing and competing branch owners', () => {
  for (const fixture of [
    '<div><Header>{title}</Header><Header>{title}</Header></div>',
    '<div><Header>{title}</Header><h2 className="page-title">{other}</h2></div>',
    '<div><Header>{title}</Header>{error && <h2 className={"page-title"}>{other}</h2>}</div>',
    '<div>{loading && <Header>{title}</Header>}</div>',
    '<div>{loading ? <div><Header>{title}</Header></div> : <Content />}</div>',
    'const Page = () => { if (error) return <Error />; return <div><Header>{title}</Header></div>; }; export default Page;',
    'const Page = () => { if (ready) return <div><Header>{title}</Header></div>; }; export default Page;',
    'const Page = () => { if (error) return <div className="mt-4"><Header>{title}</Header></div>; return <div><Header>{title}</Header></div>; }; export default Page;',
    '<div><Header style={{ marginBottom: 8 }}>{title}</Header></div>',
  ])
    assert.throws(() => assertNeutralHeaderWrapper(fixture));
});
