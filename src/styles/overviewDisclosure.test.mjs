import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import postcss from 'postcss';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const api = yaml.load(
  fs.readFileSync(new URL('../../seerr-api.yml', import.meta.url), 'utf8')
);
const disclosureModule = { exports: {} };
new Function(
  'exports',
  ts.transpileModule(
    fs.readFileSync(
      new URL('../../server/utils/detailDisclosureOrder.ts', import.meta.url),
      'utf8'
    ),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } }
  ).outputText
)(disclosureModule.exports);
const disclosure = disclosureModule.exports;
const verifyDisclosureSchema = (schema, normalized = false) => {
  assert.equal(schema.type, 'array');
  assert.equal(schema.items.type, 'string');
  assert.deepEqual(
    [...schema.items.enum].sort(),
    [...disclosure.seriesDisclosureRoles].sort(),
    'schema roles match the canonical disclosure roles'
  );
  assert.equal(
    schema.maxItems,
    disclosure.seriesDisclosureRoles.length,
    'schema accepts the complete canonical role count'
  );
  assert.equal(schema.uniqueItems, true, 'schema rejects duplicate roles');
  if (normalized)
    assert.equal(
      schema.minItems,
      disclosure.seriesDisclosureRoles.length,
      'normalized responses contain every canonical role'
    );
};

test('disclosure preference and request/response schemas match the canonical roles and normalized count', () => {
  const route =
    api.paths['/user/{id}/settings/detail-disclosure-order/{mediaType}'];
  const request = route.post.requestBody.content['application/json'].schema;
  assert.equal(request.additionalProperties, false);
  assert.deepEqual(request.required, ['order']);
  const schemas = [
    [
      api.components.schemas.UserSettings.properties.detailDisclosureOrder
        .properties.tv,
      false,
    ],
    [request.properties.order, false],
    [route.get.responses['200'].content['application/json'].schema, true],
    [route.post.responses['200'].content['application/json'].schema, true],
  ];
  for (const [schema, normalized] of schemas)
    verifyDisclosureSchema(schema, normalized);
  for (const order of [
    disclosure.normalizeSeriesDisclosureOrder(undefined),
    disclosure.normalizeSeriesDisclosureOrder(disclosure.seriesDisclosureRoles),
  ]) {
    assert.ok(disclosure.parseSeriesDisclosureOrder(order));
    for (const [schema] of schemas) {
      assert.ok(order.length <= schema.maxItems);
      assert.ok(order.every((role) => schema.items.enum.includes(role)));
    }
  }
});

test('retired schema counts, missing roles and duplicate-role permission fail with precise diagnostics', () => {
  const schema =
    api.paths['/user/{id}/settings/detail-disclosure-order/{mediaType}'].post
      .requestBody.content['application/json'].schema.properties.order;
  assert.throws(
    () => verifyDisclosureSchema({ ...schema, maxItems: schema.maxItems - 1 }),
    /schema accepts the complete canonical role count/
  );
  assert.throws(
    () =>
      verifyDisclosureSchema({
        ...schema,
        items: { ...schema.items, enum: schema.items.enum.slice(0, -1) },
      }),
    /schema roles match the canonical disclosure roles/
  );
  assert.throws(
    () => verifyDisclosureSchema({ ...schema, uniqueItems: false }),
    /schema rejects duplicate roles/
  );
  assert.throws(
    () =>
      verifyDisclosureSchema(
        { ...schema, minItems: schema.maxItems - 1 },
        true
      ),
    /normalized responses contain every canonical role/
  );
});

const source = fs.readFileSync(
  new URL('../components/TvDetails/SeriesDetailsLayout.tsx', import.meta.url),
  'utf8'
);
const ast = ts.createSourceFile(
  'Series.tsx',
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);
const nodes = [];
const visit = (node) => {
  nodes.push(node);
  ts.forEachChild(node, visit);
};
visit(ast);
const attribute = (element, name) =>
  element.attributes.properties.find(
    (p) => ts.isJsxAttribute(p) && p.name.text === name
  )?.initializer;
const expression = (element, name) => attribute(element, name)?.expression;
const section = (node) => {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (
      ts.isJsxElement(parent) &&
      parent.openingElement.tagName.getText(ast) === 'section'
    )
      return parent;
  }
};
const owner = (node, name) => {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (
      ts.isJsxElement(parent) &&
      parent.openingElement.tagName.getText(ast) === name
    )
      return parent;
  }
};
const button = nodes.find(
  (node) =>
    ts.isJsxSelfClosingElement(node) &&
    node.tagName.getText(ast) === 'DetailDisclosureButton' &&
    attribute(node, 'key')?.text === 'overview'
);

test('Overview uses the existing reorder row, independent pin and matching below-row card', () => {
  assert.ok(button);
  assert.ok(owner(button, 'ReorderableDisclosureRow'));
  assert.equal(expression(button, 'open').getText(ast), 'overviewOpen');
  assert.equal(expression(button, 'pinned').getText(ast), 'pins.overview');
  const target = attribute(button, 'controls').text;
  const panel = nodes.find(
    (node) =>
      ts.isJsxElement(node) &&
      node.openingElement.tagName.getText(ast) === 'section' &&
      attribute(node.openingElement, 'id')?.text === target
  );
  assert.ok(panel);
  assert.ok(owner(panel, 'OrderedDisclosurePanels'));
  assert.ok(panel.pos > owner(button, 'ReorderableDisclosureRow').end);
  assert.match(
    panel.parent.parent.left.getText(ast),
    /^showOverview && !upstream && overviewOpen$/
  );
  assert.match(panel.getText(ast), /data\.tagline/);
  assert.match(panel.getText(ast), /data\.overview/);
  assert.doesNotMatch(
    panel.getText(ast),
    /MetadataAttribution|featuredCrewGroups/
  );
});

test('Overview visibility honors pins, review overrides, title changes and hidden/no-controls consumers', () => {
  const effect = nodes.find(
    (node) =>
      ts.isCallExpression(node) &&
      node.expression.getText(ast) === 'useEffect' &&
      node.arguments[0]?.getText(ast).includes('setOverviewOpen(')
  );
  assert.ok(effect);
  assert.deepEqual(
    effect.arguments[1].elements.map((node) => node.getText(ast)),
    [
      'showOverview',
      'showInformationControls',
      'pins.overview',
      'data.id',
      'expandInformation',
      'collapseInformation',
    ]
  );
  const sync = new Function(
    'setOverviewOpen',
    'showOverview',
    'showInformationControls',
    'pins',
    'expandInformation',
    'collapseInformation',
    `return (${effect.arguments[0].getText(ast)})();`
  );
  for (const enabled of [false, true])
    for (const controls of [false, true])
      for (const pinned of [false, true])
        for (const expanded of [false, true])
          for (const collapsed of [false, true]) {
            const values = [];
            sync(
              (value) => values.push(value),
              enabled,
              controls,
              { overview: pinned },
              expanded,
              collapsed
            );
            assert.deepEqual(values, [
              enabled && (!controls || (!collapsed && (expanded || pinned))),
            ]);
          }
});

test('Overview clicks toggle only visibility and pin updates target only Overview', () => {
  const values = [];
  new Function(
    'setOverviewOpen',
    `return (${expression(button, 'onClick').getText(ast)})();`
  )((update) => values.push([update(false), update(true)]));
  assert.deepEqual(values, [[true, false]]);
  const pins = [];
  new Function(
    'togglePinned',
    `return (${expression(button, 'onPinClick').getText(ast)})();`
  )((role) => pins.push(role));
  assert.deepEqual(pins, ['overview']);
});

test('attribution and production credits are owned once by the bottom of Details, not Overview', () => {
  const attribution = nodes.filter(
    (node) =>
      ts.isJsxSelfClosingElement(node) &&
      node.tagName.getText(ast) === 'MetadataAttribution'
  );
  assert.equal(attribution.length, 1);
  const details = section(attribution[0]);
  assert.equal(
    attribute(details.openingElement, 'id').text,
    'tv-additional-details'
  );
  const facts = nodes.find(
    (node) =>
      ts.isJsxElement(node) &&
      attribute(node.openingElement, 'data-table-layout')?.text ===
        'series-details-table'
  );
  assert.ok(attribution[0].pos > facts.end);
  const production = nodes.find(
    (node) =>
      ts.isCallExpression(node) &&
      node.expression.getText(ast) === 'featuredCrewGroups.map'
  );
  assert.equal(section(production), details);
  assert.ok(production.pos > attribution[0].end);
  assert.equal(
    nodes.filter(
      (node) =>
        ts.isCallExpression(node) &&
        node.expression.getText(ast) === 'featuredCrewGroups.map'
    ).length,
    1
  );
});

test('distributed disclosure rows preserve native wrapping and shared geometry', () => {
  const css = postcss.parse(
    fs.readFileSync(new URL('./globals.css', import.meta.url), 'utf8')
  );
  const rules = [];
  css.walkRules((rule) => rules.push(rule));
  const base = rules.find(
    (rule) => rule.selector === '.media-detail-disclosure-row'
  );
  const variant = rules.find(
    (rule) =>
      rule.selector ===
      ".media-detail-disclosure-row[data-disclosure-layout='distributed']"
  );
  const value = (rule, property) =>
    rule.nodes.find((node) => node.type === 'decl' && node.prop === property)
      ?.value;
  assert.equal(value(base, 'display'), 'flex');
  assert.equal(value(base, 'flex-wrap'), 'wrap');
  assert.equal(value(base, 'align-items'), 'center');
  assert.equal(value(variant, 'justify-content'), 'space-between');
  assert.ok(
    variant.nodes.every(
      (node) => node.type !== 'decl' || node.prop === 'justify-content'
    )
  );
  assert.ok(
    !base.nodes.some((node) => node.type === 'atrule' && node.name === 'apply')
  );
});
