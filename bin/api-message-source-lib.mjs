import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const messageFields = new Set([
  'message',
  'error',
  'warning',
  'statusMessage',
  'lastError',
  'lastSyncError',
  'koboSyncError',
  'ruleSummary',
  'providerNotice',
  'legacyWarning',
  'reason',
  'reasons',
  'because',
]);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const sourceFiles = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    return /\.tsx?$/.test(entry.name) && !/\.(?:test|spec)\./.test(entry.name)
      ? [file]
      : [];
  });
const propertyName = (node) =>
  ts.isIdentifier(node) || ts.isStringLiteralLike(node) ? node.text : '';
const unparenthesized = (node) =>
  ts.isParenthesizedExpression(node) ? unparenthesized(node.expression) : node;

const messageHelperName = (node) => {
  for (let owner = node.parent; owner; owner = owner.parent) {
    if (ts.isFunctionDeclaration(owner) || ts.isMethodDeclaration(owner))
      return owner.name?.getText() ?? '';
    if (ts.isArrowFunction(owner) || ts.isFunctionExpression(owner))
      return ts.isVariableDeclaration(owner.parent)
        ? owner.parent.name.getText()
        : '';
  }
  return '';
};

const authoredInitializer = (node) => {
  if (!ts.isIdentifier(node)) return node;
  for (let scope = node.parent; scope; scope = scope.parent) {
    if (
      ts.isFunctionLike(scope) &&
      scope.parameters.some(
        (parameter) => parameter.name.getText() === node.text
      )
    )
      return node;
    if (!ts.isBlock(scope) && !ts.isSourceFile(scope)) continue;
    for (const statement of [...scope.statements].reverse()) {
      if (statement.getStart() >= node.getStart()) continue;
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.name.text === node.text &&
          declaration.initializer
        )
          return declaration.initializer;
      }
    }
  }
  return node;
};

/** Expand authored branches; leave genuinely dynamic expressions as parameters. */
const alternatives = (original, depth = 0) => {
  const node = unparenthesized(original);
  if (depth > 10) return [[node]];
  const initializer = authoredInitializer(node);
  if (initializer !== node) return alternatives(initializer, depth + 1);
  if (ts.isStringLiteralLike(node)) return [[node.text]];
  if (ts.isConditionalExpression(node)) {
    return [
      ...alternatives(node.whenTrue, depth + 1),
      ...alternatives(node.whenFalse, depth + 1),
    ].slice(0, 64);
  }
  if (
    ts.isBinaryExpression(node) &&
    [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(
      node.operatorToken.kind
    )
  ) {
    return [
      ...alternatives(node.left, depth + 1),
      ...alternatives(node.right, depth + 1),
    ].slice(0, 64);
  }
  if (ts.isTemplateExpression(node)) {
    let choices = [[node.head.text]];
    for (const span of node.templateSpans) {
      choices = choices
        .flatMap((prefix) =>
          alternatives(span.expression, depth + 1).map((value) => [
            ...prefix,
            ...value,
            span.literal.text,
          ])
        )
        .slice(0, 64);
    }
    return choices;
  }
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    return alternatives(node.left, depth + 1)
      .flatMap((left) =>
        alternatives(node.right, depth + 1).map((right) => [...left, ...right])
      )
      .slice(0, 64);
  }
  return [[node]];
};

const toPattern = (segments, file) => {
  const parts = [''];
  const expressions = [];
  for (const segment of segments) {
    if (typeof segment === 'string') parts[parts.length - 1] += segment;
    else {
      if (expressions.length && parts[parts.length - 1] === '') {
        expressions[expressions.length - 1] += ` + ${segment.getText(file)}`;
      } else {
        expressions.push(segment.getText(file));
        parts.push('');
      }
    }
  }
  const rawSource = parts
    .map(
      (part, index) =>
        part + (index < expressions.length ? `{value${index}}` : '')
    )
    .join('');
  return { rawSource, parts, expressions };
};

/** Quote authored text for ICU; captured values are interpolated separately. */
export const quoteIcuLiteral = (value) =>
  value
    .replaceAll("'", "''")
    .replaceAll('{', "'{'")
    .replaceAll('}', "'}'")
    .replaceAll('<', "'<'");

export const scanApiMessageSources = (root) => {
  const entries = new Map();
  const opaque = [];
  for (const file of sourceFiles(path.join(root, 'server')).sort()) {
    if (file.includes(`${path.sep}i18n${path.sep}locale${path.sep}`)) continue;
    const text = fs.readFileSync(file, 'utf8');
    const source = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true
    );
    const relativePath = path.relative(root, file).split(path.sep).join('/');
    const add = (node, kind, field) => {
      const callsite = {
        path: relativePath,
        line:
          source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
        kind,
        field,
        expression: node.getText(source),
      };
      for (const variant of alternatives(authoredInitializer(node))) {
        const pattern = toPattern(variant, source);
        const authoredLength = pattern.parts.join('').trim().length;
        let reason;
        if (!pattern.rawSource.trim()) reason = 'empty value';
        else if (!authoredLength) reason = 'dynamic/provider/user value';
        else if (
          pattern.expressions.length &&
          authoredLength < (['reason', 'because'].includes(field) ? 3 : 8)
        )
          reason =
            'data assembly without a sufficiently specific authored phrase';
        else if (
          /^[A-Z][A-Z0-9_]*_[A-Z0-9_]+$/.test(pattern.rawSource) ||
          (field === 'reason' &&
            /^[a-z][a-z0-9]*(?:[-_.:][a-z0-9]+)+$/.test(pattern.rawSource))
        )
          reason = 'stable protocol/control-flow code';
        else if (
          kind === 'response-body' &&
          /<\/?(?:html|script|head|body)\b/i.test(pattern.rawSource)
        )
          reason =
            'HTML response document; separate page/template localization surface';
        if (reason) {
          opaque.push({ ...callsite, source: pattern.rawSource, reason });
          continue;
        }
        const defaultMessage = pattern.parts
          .map(
            (part, index) =>
              quoteIcuLiteral(part) +
              (index < pattern.expressions.length ? `{value${index}}` : '')
          )
          .join('');
        const key = `m${hash(pattern.rawSource).slice(0, 20)}`;
        const existing = entries.get(key);
        if (existing && existing.source !== pattern.rawSource)
          throw new Error('API message identity collision');
        const entry = existing ?? {
          key,
          id: `utils.ApiMessage.${key}`,
          source: pattern.rawSource,
          defaultMessage,
          sourceHash: hash(defaultMessage),
          parts: pattern.parts,
          parameterCount: pattern.expressions.length,
          callsites: [],
        };
        const captured = pattern.expressions.map((expression, index) => ({
          name: `value${index}`,
          expression,
          disposition: 'opaque captured value; preserve verbatim',
        }));
        const value = { ...callsite, captured };
        if (
          !entry.callsites.some(
            (site) => JSON.stringify(site) === JSON.stringify(value)
          )
        )
          entry.callsites.push(value);
        entries.set(key, entry);
      }
    };
    const visit = (node) => {
      if (
        ts.isPropertyAssignment(node) &&
        messageFields.has(propertyName(node.name))
      )
        add(
          node.initializer,
          'authored-message-field',
          propertyName(node.name)
        );
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        /(?:message|error|warning|summary)$/i.test(node.name.text) &&
        node.initializer
      )
        add(node.initializer, 'authored-message-variable', node.name.text);
      if (
        ts.isReturnStatement(node) &&
        node.expression &&
        /(?:error|message|warning|rule|summary|status)/i.test(
          messageHelperName(node)
        )
      )
        add(node.expression, 'message-helper-return', 'message');
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isPropertyAccessExpression(node.left) &&
        messageFields.has(node.left.name.text)
      )
        add(node.right, 'persisted-message-assignment', node.left.name.text);
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        const name = ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : ts.isIdentifier(callee)
            ? callee.text
            : '';
        if (
          name === 'send' &&
          ts.isPropertyAccessExpression(callee) &&
          /^res(?:ponse)?(?:\.|$)/.test(callee.expression.getText(source))
        ) {
          for (const argument of node.arguments)
            add(argument, 'response-body', 'body');
        }
        if (
          /^(?:createError|httpError|badRequest|notFound|forbidden|unauthorized)$/i.test(
            name
          )
        ) {
          for (const argument of node.arguments)
            if (
              ts.isStringLiteralLike(argument) ||
              ts.isTemplateExpression(argument)
            )
              add(argument, 'http-error', 'message');
        }
      }
      if (
        ts.isNewExpression(node) &&
        /(?:Error|Exception)$/.test(node.expression.getText(source)) &&
        node.arguments?.[0]
      )
        add(node.arguments[0], 'app-error-candidate', 'message');
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return {
    schemaVersion: 1,
    namespace: 'utils.ApiMessage',
    scope:
      'Known app-authored API, persisted-status and app-error phrases at explicit UI message boundaries. Source callsites are candidates for display, not a claim that internal logs are translated.',
    entries: [...entries.values()].sort((a, b) => a.id.localeCompare(b.id)),
    opaque,
  };
};
