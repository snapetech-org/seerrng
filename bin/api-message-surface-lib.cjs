const ts = require('typescript');

const findUnlocalizedMessageConstructions = (
  source,
  relativePath,
  controlState = new Set()
) => {
  const found = [];
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      /^(?:set.*(?:Error|Failure|Message|Notice|Success|Status)|addToast)$/i.test(
        node.expression.text
      ) &&
      node.arguments[0]
    ) {
      const active = new Set();
      const findRaw = (value) => {
        if (active.has(value)) return;
        active.add(value);
        if (
          ts.isIdentifier(value) &&
          !(
            ts.isPropertyAccessExpression(value.parent) &&
            value.parent.name === value
          )
        ) {
          let resolved;
          for (let scope = value.parent; scope; scope = scope.parent) {
            if (
              ts.isFunctionLike(scope) &&
              scope.parameters.some(
                (p) => p.name.getText(source) === value.text
              )
            )
              break;
            if (!ts.isBlock(scope) && !ts.isSourceFile(scope)) continue;
            for (const statement of [...scope.statements].reverse()) {
              if (
                statement.getStart(source) >= value.getStart(source) ||
                !ts.isVariableStatement(statement) ||
                !(statement.declarationList.flags & ts.NodeFlags.Const)
              )
                continue;
              const declaration = statement.declarationList.declarations.find(
                (d) =>
                  ts.isIdentifier(d.name) &&
                  d.name.text === value.text &&
                  d.initializer
              );
              if (declaration) {
                resolved = declaration.initializer;
                break;
              }
            }
            if (resolved) break;
          }
          if (resolved) {
            findRaw(resolved);
            return;
          }
        }
        if (
          ts.isCallExpression(value) &&
          /\bformatMessage$/.test(value.expression.getText(source))
        )
          return;
        if (
          ts.isCallExpression(value) ||
          ts.isPropertyAccessExpression(value) ||
          ts.isElementAccessExpression(value)
        )
          return;
        if (ts.isJsxAttribute(value) || ts.isTypeOfExpression(value)) return;
        if (ts.isConditionalExpression(value)) {
          findRaw(value.whenTrue);
          findRaw(value.whenFalse);
          return;
        }
        if (
          ts.isBinaryExpression(value) &&
          ![
            ts.SyntaxKind.BarBarToken,
            ts.SyntaxKind.QuestionQuestionToken,
            ts.SyntaxKind.PlusToken,
          ].includes(value.operatorToken.kind)
        )
          return;
        if (
          (ts.isStringLiteralLike(value) ||
            ts.isTemplateHead(value) ||
            ts.isTemplateMiddle(value) ||
            ts.isTemplateTail(value)) &&
          /[A-Za-z]{3,}/.test(value.text) &&
          !controlState.has(
            relativePath + ':' + node.expression.text + ':' + value.text
          )
        ) {
          found.push({
            file: relativePath,
            line:
              source.getLineAndCharacterOfPosition(value.getStart(source))
                .line + 1,
            text: value.text,
          });
        }
        ts.forEachChild(value, findRaw);
      };
      findRaw(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
};
module.exports = { findUnlocalizedMessageConstructions };

const findUnlocalizedDisplayExpressions = (source, relativePath) => {
  const found = [];
  const technical = new Set([
    'https://',
    'http://',
    'HD',
    'Mylar3',
    'Kapowarr',
    'BackIssue',
    ' · HTTP ',
  ]);
  const data = new Set([
    'src/components/Settings/BookshelfPathMigration.tsx:ebook',
  ]);
  const visit = (node) => {
    if (
      ts.isJsxExpression(node) &&
      node.expression &&
      (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))
    ) {
      const inspect = (value) => {
        if (
          ts.isCallExpression(value) ||
          ts.isPropertyAccessExpression(value) ||
          ts.isElementAccessExpression(value) ||
          ts.isArrowFunction(value) ||
          ts.isFunctionExpression(value) ||
          ts.isJsxElement(value) ||
          ts.isJsxFragment(value) ||
          ts.isJsxAttribute(value)
        )
          return;
        if (ts.isConditionalExpression(value)) {
          inspect(value.whenTrue);
          inspect(value.whenFalse);
          return;
        }
        if (ts.isBinaryExpression(value)) {
          if (
            value.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
          ) {
            inspect(value.right);
            return;
          }
          if (
            ![
              ts.SyntaxKind.BarBarToken,
              ts.SyntaxKind.QuestionQuestionToken,
              ts.SyntaxKind.PlusToken,
            ].includes(value.operatorToken.kind)
          )
            return;
        }
        if (ts.isAsExpression(value) || ts.isTypeAssertionExpression(value)) {
          inspect(value.expression);
          return;
        }
        if (
          (ts.isStringLiteralLike(value) ||
            ts.isTemplateHead(value) ||
            ts.isTemplateMiddle(value) ||
            ts.isTemplateTail(value)) &&
          /[A-Za-z]{2,}/.test(value.text) &&
          !technical.has(value.text) &&
          !data.has(relativePath + ':' + value.text)
        ) {
          found.push({
            file: relativePath,
            line:
              source.getLineAndCharacterOfPosition(value.getStart(source))
                .line + 1,
            text: value.text,
          });
        }
        ts.forEachChild(value, inspect);
      };
      inspect(node.expression);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
};
module.exports.findUnlocalizedDisplayExpressions =
  findUnlocalizedDisplayExpressions;
