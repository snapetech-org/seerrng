import { isPluralElement, parse } from '@formatjs/icu-messageformat-parser';

const formatFunctionNames = new Set(['$formatMessage', 'formatMessage', '$t']);
const componentNames = new Set(['FormattedMessage']);
const transparentTypescriptExpressions = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
]);

function getStaticString(node) {
  if (!node) return undefined;
  if (transparentTypescriptExpressions.has(node.type))
    return getStaticString(node.expression);

  switch (node.type) {
    case 'Literal':
      return typeof node.value === 'string' ? node.value : undefined;
    case 'TemplateLiteral':
      return node.quasis.length === 1
        ? (node.quasis[0].value.cooked ?? undefined)
        : undefined;
    case 'TaggedTemplateExpression':
      return node.quasi.quasis.length === 1
        ? (node.quasi.quasis[0].value.cooked ?? undefined)
        : undefined;
    case 'BinaryExpression': {
      if (node.operator !== '+') return undefined;
      const left = getStaticString(node.left);
      const right = getStaticString(node.right);
      return left !== undefined && right !== undefined
        ? left + right
        : undefined;
    }
    default:
      return undefined;
  }
}

function getPropertyName(property) {
  if (property.type !== 'Property') return undefined;
  if (property.key.type === 'Identifier') return property.key.name;
  if (property.key.type === 'Literal') return property.key.value;
  return undefined;
}

function unwrapObjectExpression(expression) {
  let node = expression;
  while (node && transparentTypescriptExpressions.has(node.type))
    node = node.expression;
  return node?.type === 'ObjectExpression' ? node : undefined;
}

function getDefaultMessage(expression) {
  const objectExpression = unwrapObjectExpression(expression);
  if (objectExpression?.type !== 'ObjectExpression') return undefined;
  for (const property of objectExpression.properties) {
    if (getPropertyName(property) === 'defaultMessage') {
      return {
        node: property.value,
        value: getStaticString(property.value),
      };
    }
  }
  return undefined;
}

function getCalleeName(callee) {
  if (callee.type === 'Identifier') return callee.name;
  if (
    callee.type === 'MemberExpression' &&
    callee.property.type === 'Identifier'
  )
    return callee.property.name;
  return undefined;
}

function getSettings(context) {
  return context.settings.formatjs ?? context.settings;
}

function messagesForCall(node, settings) {
  const [descriptor, values] = node.arguments;
  if (!descriptor || descriptor.type === 'SpreadElement') return [];

  const name = getCalleeName(node.callee);
  if (!name) return [];

  if (name === 'defineMessages') {
    if (settings.excludeMessageDeclCalls) return [];
    const messageDictionary =
      getStaticString(descriptor) !== undefined ? values : descriptor;
    const messages = unwrapObjectExpression(messageDictionary);
    if (!messages) return [];
    return messages.properties.flatMap((property) => {
      if (property.type !== 'Property') return [];
      const descriptorMessage = getDefaultMessage(property.value);
      if (descriptorMessage) return [descriptorMessage];
      const value = getStaticString(property.value);
      return value === undefined ? [] : [{ node: property.value, value }];
    });
  }

  const additionalFunctionNames = Array.isArray(
    settings.additionalFunctionNames
  )
    ? settings.additionalFunctionNames
    : [];
  const isMessageDeclaration = name === 'defineMessage';
  const isFormatCall =
    formatFunctionNames.has(name) || additionalFunctionNames.includes(name);
  if (
    (isMessageDeclaration && settings.excludeMessageDeclCalls) ||
    (!isMessageDeclaration && !isFormatCall) ||
    values?.type === 'SpreadElement'
  )
    return [];

  const message = getDefaultMessage(descriptor);
  return message ? [message] : [];
}

function messagesForJsx(node, settings) {
  const additionalComponentNames = Array.isArray(
    settings.additionalComponentNames
  )
    ? settings.additionalComponentNames
    : [];
  if (
    node.name?.type !== 'JSXIdentifier' ||
    ![...componentNames, ...additionalComponentNames].includes(node.name.name)
  )
    return [];

  for (const attribute of node.attributes) {
    if (
      attribute.type !== 'JSXAttribute' ||
      attribute.name.type !== 'JSXIdentifier' ||
      attribute.name.name !== 'defaultMessage' ||
      !attribute.value
    )
      continue;

    const expression =
      attribute.value.type === 'JSXExpressionContainer'
        ? attribute.value.expression
        : attribute.value;
    return [
      {
        node: attribute.value,
        value:
          expression.type === 'JSXEmptyExpression'
            ? undefined
            : getStaticString(expression),
      },
    ];
  }
  return [];
}

function containsPluralOffset(elements) {
  for (const element of elements) {
    if (!isPluralElement(element)) continue;
    if (element.offset) return true;
    if (
      Object.values(element.options).some(({ value }) =>
        containsPluralOffset(value)
      )
    )
      return true;
  }
  return false;
}

export const noOffsetRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow offset in plural rules',
      url: 'https://formatjs.github.io/docs/tooling/linter#no-offset',
    },
    fixable: 'code',
    schema: [],
    messages: {
      noOffset: 'offset is not allowed',
      parseError: 'Failed to parse message string {{error}}',
    },
  },
  create(context) {
    const settings = getSettings(context);

    function checkMessages(node, messages) {
      for (const message of messages) {
        if (!message.value || !message.node) continue;

        let ast;
        try {
          ast = parse(message.value, { ignoreTag: settings.ignoreTag });
        } catch (error) {
          context.report({
            node: message.node,
            messageId: 'parseError',
            data: {
              error: error instanceof Error ? error.message : String(error),
            },
          });
          continue;
        }

        if (containsPluralOffset(ast)) {
          context.report({ node: message.node, messageId: 'noOffset' });
        }
      }
    }

    return {
      CallExpression(node) {
        checkMessages(node, messagesForCall(node, settings));
      },
      JSXOpeningElement(node) {
        checkMessages(node, messagesForJsx(node, settings));
      },
    };
  },
};

export default {
  meta: { name: 'formatjs' },
  rules: { 'no-offset': noOffsetRule },
};
