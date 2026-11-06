const fs = require('fs'),
  path = require('path');
const W = path.resolve(__dirname, '..');
const ts = require(W + '/node_modules/typescript');
const {
  findUnlocalizedMessageConstructions,
  findUnlocalizedDisplayExpressions,
  findUnlocalizedAccessibilityAttributes,
  findUnlocalizedEmailSubjectCopy,
} = require('./api-message-surface-lib.cjs');
const files = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? files(path.join(dir, e.name))
        : /\.tsx$/.test(e.name) && !/\.(test|spec)\./.test(e.name)
          ? [path.join(dir, e.name)]
          : []
    );
const rows = [];
const rawConstructions = [];
const rawAccessibility = [];
const rawEmailSubjects = [];
const controlState = new Set([
  'src/components/DiscoveryIntegrations/Configuration.tsx:setMessage:saved',
  'src/components/DiscoveryIntegrations/Configuration.tsx:setMessage:failed',
  'src/components/GameLibrary/index.tsx:setManualStatus:backlog',
  // ProviderStatus is a protocol/state enum; render helpers localize its labels.
  'src/components/Settings/SettingsMetadata.tsx:setProviderStatus:not tested',
  'src/components/Settings/SettingsMetadata.tsx:setProviderStatus:failed',
]);
for (const file of files(W + '/src')) {
  const text = fs.readFileSync(file, 'utf8'),
    sf = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );
  rawConstructions.push(
    ...findUnlocalizedMessageConstructions(
      sf,
      path.relative(W, file).split(path.sep).join('/'),
      controlState
    )
  );
  rawConstructions.push(
    ...findUnlocalizedDisplayExpressions(
      sf,
      path.relative(W, file).split(path.sep).join('/')
    )
  );
  rawAccessibility.push(
    ...findUnlocalizedAccessibilityAttributes(
      sf,
      path.relative(W, file).split(path.sep).join('/')
    )
  );
  const visit = (n) => {
    if (ts.isJsxExpression(n) && n.expression) {
      const x = n.expression,
        raw = x.getText(sf).replaceAll('\r\n', '\n');
      let jsx = false;
      const check = (k) => {
        if (ts.isJsxElement(k) || ts.isJsxSelfClosingElement(k)) {
          jsx = true;
          return;
        }
        ts.forEachChild(k, check);
      };
      check(x);
      if (
        !jsx &&
        /\b(?:message|error|warning|notice|reason|lastError|lastSyncError|koboSyncError|ruleSummary|providerErrorMessage|requestError|statusMessage|currentMessage|messageText|errorMessage|providerNotice|legacyWarning)\b/i.test(
          raw
        )
      ) {
        let parent = n.parent,
          context = [],
          attribute;
        while (parent && !ts.isSourceFile(parent)) {
          if (ts.isJsxElement(parent))
            context.push(parent.openingElement.tagName.getText(sf));
          if (ts.isJsxSelfClosingElement(parent))
            context.push(parent.tagName.getText(sf));
          if (ts.isJsxAttribute(parent)) attribute = parent.name.getText(sf);
          parent = parent.parent;
        }
        if (
          !attribute ||
          /^(?:title|label|placeholder|content|description|aria-label|children|message|error|warning|notice|statusMessage)$/.test(
            attribute
          )
        ) {
          let classification =
            context.includes('ApiMessageText') ||
            /\bformatApiMessage\(/.test(raw)
              ? 'api-localized'
              : context.includes('OpaqueApiMessageText')
                ? 'provider-data'
                : context.some((owner) =>
                      [
                        'ApiErrorToastText',
                        'RequestStatusMessageText',
                      ].includes(owner)
                    )
                  ? 'localized-child-boundary'
                  : /\b(?:formatMessage|FormattedMessage)\b/.test(raw)
                    ? 'already-localized'
                    : 'review-required';
          rows.push({
            file: path.relative(W, file).split(path.sep).join('/'),
            line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1,
            expression: raw,
            context,
            attribute,
            classification,
          });
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

for (const entry of fs.readdirSync(path.join(W, 'server/templates/email'), {
  withFileTypes: true,
})) {
  if (!entry.isDirectory()) continue;
  const file = path.join(
    W,
    'server/templates/email',
    entry.name,
    'subject.pug'
  );
  if (!fs.existsSync(file)) continue;
  rawEmailSubjects.push(
    ...findUnlocalizedEmailSubjectCopy(
      path.relative(W, file).split(path.sep).join('/'),
      fs.readFileSync(file, 'utf8')
    )
  );
}

if (
  rawConstructions.length ||
  rawAccessibility.length ||
  rawEmailSubjects.length
) {
  console.error('Fixed user-facing copy needs a locale message:');
  console.error(
    JSON.stringify(
      {
        messageConstructions: rawConstructions,
        accessibilityAttributes: rawAccessibility,
        emailSubjects: rawEmailSubjects,
      },
      null,
      2
    )
  );
  process.exit(1);
}

const classifications = JSON.parse(
  fs.readFileSync(
    path.join(W, 'config/i18n/api-message-surface-classifications.json'),
    'utf8'
  )
).entries;
for (const row of rows) {
  if (row.classification === 'review-required') {
    const reviewed = classifications.find(
      (entry) => entry.file === row.file && entry.expression === row.expression
    );
    if (reviewed) {
      row.classification = reviewed.classification;
      row.reason = reviewed.reason;
    }
  }
}
const missing = rows.filter((row) => row.classification === 'review-required');
if (missing.length) {
  console.error(JSON.stringify(missing, null, 2));
  process.exit(1);
}
const manifest = {
  schemaVersion: 1,
  scope:
    'Entries inventory rendered JSX message/error/status fields. Companion checks also reject static accessibility text attributes and fixed copy in app-authored email subject templates. The guard complements the authored-server-source and direct-response caller inventories; it does not certify arbitrary provider/user/log text as translated.',
  entries: rows,
};
const target = path.join(W, 'config/i18n/api-message-surfaces.json');
if (process.argv.includes('--write'))
  fs.writeFileSync(target, JSON.stringify(manifest, null, 2) + '\n');
else {
  const previous = JSON.parse(fs.readFileSync(target, 'utf8'));
  const comparable = (value) => value.entries.map(({ line, ...row }) => row);
  if (
    JSON.stringify(comparable(manifest)) !==
    JSON.stringify(comparable(previous))
  ) {
    console.error(
      'API message rendering surfaces changed; review classifications and regenerate with --write.'
    );
    process.exit(1);
  }
}
console.log('Reviewed message rendering surfaces: ' + rows.length + '.');
