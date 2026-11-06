import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import ts from 'typescript';

const componentSource = fs.readFileSync(
  'src/components/VisualLab/index.tsx',
  'utf8'
);
const localeConfig = JSON.parse(
  fs.readFileSync('config/i18n/locales.json', 'utf8')
);
const englishMessages = JSON.parse(
  fs.readFileSync('src/i18n/locale/en.json', 'utf8')
);

const draftMessageKeys = [
  'demoPageTitleSample',
  'demoCardTitleSample',
  'demoCardHeadingSample',
  'demoButtonTextSample',
  'demoLight',
  'demoNormal',
  'demoDark',
  'demoDimmed',
  'demoActive',
  'demoHover',
  'demoFamilyTitle',
  'demoFamilyPaletteButtons',
  'demoMetallicBackgroundBorder',
  'demoFamilyBorder',
  'demoMetallicBorderBackground',
  'demoStyleName',
  'demoPaletteName',
  'demoColorPaletteName',
  'demoShadeColorName',
  'demoSteel',
  'demoChrome',
  'demoLiquid',
  'demoGray',
  'demoBlack',
  'demoRed',
  'demoOrange',
  'demoYellow',
  'demoLime',
  'demoGreen',
  'demoAqua',
  'demoBlue',
  'demoPurple',
  'demoPlum',
  'demoPink',
];

const existingMessageKeys = [
  'title',
  'titleText',
  'titleTextDescription',
  'borders',
  'bordersDescription',
  'buttons',
  'buttonsDescription',
  'seriesTestingPage',
  'seriesTestingDescription',
  'paletteTreatmentFilter',
  'allPalettes',
  'solidPalette',
  'gradientPalette',
  'metallicPalette',
];

const allVisualLabMessageKeys = [...existingMessageKeys, ...draftMessageKeys];

const staticTextMessages: Record<string, string> = {
  Active: 'demoActive',
  All: 'allPalettes',
  Borders: 'borders',
  Buttons: 'buttons',
  'Card Heading': 'demoCardHeadingSample',
  'Card Title': 'demoCardTitleSample',
  Dark: 'demoDark',
  Dimmed: 'demoDimmed',
  Gradiant: 'gradientPalette',
  'Gradiant Border': 'demoFamilyBorder',
  'Gradiant Palette Buttons': 'demoFamilyPaletteButtons',
  'Gradiant Title': 'demoFamilyTitle',
  Hover: 'demoHover',
  Light: 'demoLight',
  Metalic: 'metallicPalette',
  'Metalic Background &amp; Border': 'demoMetallicBackgroundBorder',
  'Metalic Border': 'demoFamilyBorder',
  'Metalic Border &amp; Background': 'demoMetallicBorderBackground',
  'Metalic Title': 'demoFamilyTitle',
  Normal: 'demoNormal',
  'Page Title': 'demoPageTitleSample',
  Solid: 'solidPalette',
  'Solid Border': 'demoFamilyBorder',
  'Solid Palette Buttons': 'demoFamilyPaletteButtons',
  'Solid Title': 'demoFamilyTitle',
  'Title Text': 'titleText',
};

const dynamicTextMessages: Record<string, string[]> = {
  'Liquid Chrome': ['demoStyleName', 'demoLiquid', 'demoChrome'],
  'Metalic Chrome': ['demoStyleName', 'metallicPalette', 'demoChrome'],
};

const targetLocales = [
  'ar',
  'de',
  'es',
  'fr',
  'hi',
  'id',
  'ja',
  'ko',
  'pt-BR',
  'vi',
  'zh-CN',
  'zh-TW',
];

const extractStaticTemplateText = (source: string) => {
  const sourceFile = ts.createSourceFile(
    'VisualLab.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const found = new Set<string>();
  const addTemplatePart = (part: string) => {
    const markup = part.replace(/<script\b[\s\S]*?<\/script>/gi, '');
    for (const match of markup.matchAll(/>([^<>]+)</g)) {
      const text = match[1].trim();
      if (/^[A-Za-z][A-Za-z &;'-]*$/.test(text)) found.add(text);
    }
  };
  const visit = (node: ts.Node) => {
    if (ts.isNoSubstitutionTemplateLiteral(node)) addTemplatePart(node.text);
    if (ts.isTemplateExpression(node)) {
      addTemplatePart(node.head.text);
      for (const span of node.templateSpans) addTemplatePart(span.literal.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...found].sort();
};

describe('Visual Lab iframe localization contract', () => {
  it('covers the fixed srcDoc text with catalog messages or translated style names', () => {
    const discovered = extractStaticTemplateText(componentSource);
    const expected = [
      ...Object.keys(staticTextMessages),
      ...Object.keys(dynamicTextMessages),
    ].sort();
    assert.deepEqual(discovered, expected);

    for (const [label, key] of Object.entries(staticTextMessages)) {
      assert.equal(
        typeof englishMessages[`components.VisualLab.${key}`],
        'string',
        `${label} must map to an English catalog message`
      );
      assert.ok(
        componentSource.includes(`messages.${key}`) ||
          componentSource.includes(`format('${key}')`) ||
          componentSource.includes(`format("${key}")`) ||
          componentSource.includes(`'${key}'`) ||
          componentSource.includes(`"${key}"`),
        `${label} must be connected to the translation formatter`
      );
    }
    for (const [label, keys] of Object.entries(dynamicTextMessages)) {
      assert.ok(
        componentSource.includes(label),
        `${label} must stay accounted for`
      );
      for (const key of keys) {
        assert.ok(
          componentSource.includes(`'${key}'`) ||
            componentSource.includes(`"${key}"`),
          `${label} must use ${key}`
        );
      }
    }
    assert.match(componentSource, /const document = withVisualLabCopy\(/);
    assert.ok(componentSource.includes('Button Text'));
    assert.ok(componentSource.includes("'demoButtonTextSample'"));
    assert.match(componentSource, /translatedStyleName\(/);
    assert.match(componentSource, /translatedPaletteName\(/);
    assert.match(componentSource, /aria-label="Palette treatment filter"/);

    const paletteClasses = componentSource.match(
      /const titlePaletteClasses = \[([\s\S]*?)\n\];/
    );
    assert.ok(paletteClasses, 'the palette list must remain discoverable');
    const colors = new Set(
      [...paletteClasses[1].matchAll(/'([^']+)'/g)].map(([, value]) =>
        value.split('-').at(-1)
      )
    );
    for (const color of colors) {
      const key = `demo${color![0].toUpperCase()}${color!.slice(1)}`;
      assert.ok(
        draftMessageKeys.includes(key),
        `${color} needs a catalog value`
      );
      assert.ok(
        componentSource.includes(`${color}: '${key}'`),
        `${color} must use its translated style name`
      );
    }
  });

  it('has nonempty catalog values for every iframe message in all rollout locales', () => {
    const fileByLocale = new Map(
      localeConfig.locales.map(
        (locale: { tag: string; clientFile: string }) => [
          locale.tag,
          locale.clientFile,
        ]
      )
    );

    for (const locale of targetLocales) {
      const filename = fileByLocale.get(locale);
      assert.ok(filename, `missing registry entry for ${locale}`);
      const catalog = JSON.parse(
        fs.readFileSync(
          path.join('src/i18n/locale', filename as string),
          'utf8'
        )
      );
      for (const key of allVisualLabMessageKeys) {
        const id = `components.VisualLab.${key}`;
        assert.equal(
          typeof catalog[id],
          'string',
          `${locale} ${id} must be text`
        );
        assert.ok(catalog[id].trim(), `${locale} ${id} must be nonempty`);
      }
    }
  });
});
