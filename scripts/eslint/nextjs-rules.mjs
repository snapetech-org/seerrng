import {
  findVariable,
  getStringIfConstant,
} from '@eslint-community/eslint-utils';

const absoluteUrlPattern = /^(?:[a-z][\d+.a-z-]*:|\/\/)/iu;
const globalPrefixes = new Set(['window', 'globalThis', 'document', 'self']);
const ruleUrl =
  'https://nextjs.org/docs/messages/no-location-assign-relative-destination';

function isMemberExpressionWithName(expression, name) {
  if (expression.type !== 'MemberExpression') return false;
  return expression.computed
    ? expression.property.type === 'Literal' &&
        expression.property.value === name
    : expression.property.type === 'Identifier' &&
        expression.property.name === name;
}

function getLocationRootIdentifier(expression) {
  if (expression.type === 'Identifier' && expression.name === 'location')
    return expression;
  if (
    expression.type === 'MemberExpression' &&
    expression.object.type === 'Identifier' &&
    globalPrefixes.has(expression.object.name) &&
    isMemberExpressionWithName(expression, 'location')
  )
    return expression.object;
  return null;
}

function isGlobalReference(sourceCode, identifier) {
  if (!identifier) return false;
  const globalScope = sourceCode.scopeManager?.scopes[0];
  const variable = globalScope?.set.get(identifier.name);
  return Boolean(
    variable &&
    variable.defs.length === 0 &&
    variable.references.some(
      ({ identifier: reference }) => reference === identifier
    )
  );
}

function isRelativeUrl(value) {
  return !absoluteUrlPattern.test(value);
}

function getStaticStringPrefix(node, sourceCode) {
  const constantValue = getStringIfConstant(node, sourceCode.getScope(node));
  if (constantValue !== null) return constantValue;

  if (node.type === 'TemplateLiteral' && node.quasis.length > 0)
    return node.quasis[0].value.cooked ?? node.quasis[0].value.raw;
  if (node.type === 'BinaryExpression' && node.operator === '+')
    return getStaticStringPrefix(node.left, sourceCode);

  if (node.type === 'Identifier') {
    const variable = findVariable(sourceCode.getScope(node), node);
    if (!variable || variable.defs.length < 1) return null;

    const definition = variable.defs[variable.defs.length - 1];
    if (definition.type !== 'Variable') return null;

    const readPosition = node.range?.[0];
    if (readPosition === undefined) return null;
    let lastWriteExpression = definition.node.init ?? null;
    for (const reference of variable.references) {
      const referencePosition = reference.identifier.range?.[0];
      if (referencePosition === undefined || referencePosition >= readPosition)
        break;
      if (
        reference.isWrite() &&
        reference.writeExpr &&
        reference.writeExpr !== definition.node.init
      )
        lastWriteExpression = reference.writeExpr;
    }

    return lastWriteExpression
      ? getStaticStringPrefix(lastWriteExpression, sourceCode)
      : null;
  }

  return null;
}

const noLocationAssignRelativeDestination = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Prevent location navigation to relative internal Next.js destinations',
      url: ruleUrl,
    },
    schema: [],
    messages: {
      noLocationAssign:
        'Do not use `{{expression}}` to navigate to internal Next.js pages. Use `redirect()` in the render phase, or `useRouter().push()` in Client Components event handlers instead. See: ' +
        ruleUrl,
    },
  },
  create(context) {
    const { sourceCode } = context;
    if (!sourceCode.scopeManager) return {};

    return {
      CallExpression(node) {
        const { callee, arguments: args } = node;
        if (!isMemberExpressionWithName(callee, 'assign')) return;
        const rootIdentifier = getLocationRootIdentifier(callee.object);
        if (!isGlobalReference(sourceCode, rootIdentifier) || args.length < 1)
          return;

        const firstArgument = args[0];
        if (firstArgument.type === 'SpreadElement') return;
        const value = getStaticStringPrefix(firstArgument, sourceCode);
        if (value !== null && isRelativeUrl(value))
          context.report({
            node,
            messageId: 'noLocationAssign',
            data: { expression: `${sourceCode.getText(callee)}()` },
          });
      },
      AssignmentExpression(node) {
        const { left, right } = node;
        if (!isMemberExpressionWithName(left, 'href')) return;
        const rootIdentifier = getLocationRootIdentifier(left.object);
        if (!isGlobalReference(sourceCode, rootIdentifier)) return;
        const value = getStaticStringPrefix(right, sourceCode);
        if (value !== null && isRelativeUrl(value))
          context.report({
            node,
            messageId: 'noLocationAssign',
            data: { expression: sourceCode.getText(left) },
          });
      },
    };
  },
};

export default {
  meta: { name: '@next/eslint-plugin-next-local' },
  rules: {
    'no-location-assign-relative-destination':
      noLocationAssignRelativeDestination,
  },
};
