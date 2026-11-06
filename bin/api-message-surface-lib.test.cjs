const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');
const {
  findUnlocalizedMessageConstructions,
} = require('./api-message-surface-lib.cjs');
const check = (text, file = 'src/example.tsx', controls = new Set()) =>
  findUnlocalizedMessageConstructions(
    ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    ),
    file,
    controls
  );

test('rejects literal and template copy constructed before the rendering boundary', () => {
  assert.equal(
    check('setMessage("ReadMeABook settings saved.")')[0].text,
    'ReadMeABook settings saved.'
  );
  assert.equal(
    check('setNotice(`${book.title} requested.`)')[0].text,
    ' requested.'
  );
});
test('checks fallback values while preserving type/control conditions', () => {
  assert.equal(
    check(
      'setError(typeof payload.message === "string" ? payload.message : intl.formatMessage(messages.failed))'
    ).length,
    0
  );
  assert.equal(check('setError(message || "Sign-in failed.")').length, 1);
});
test('accepts translated construction and JSX metadata without treating data as copy', () => {
  assert.equal(
    check(
      'setNotice(intl.formatMessage(messages.requested, { title: book.title }))'
    ).length,
    0
  );
  assert.equal(
    check(
      'addToast(<span dir="auto">{intl.formatMessage(messages.failed)}</span>)'
    ).length,
    0
  );
});
test('control-state exceptions bind both source path and value', () => {
  const controls = new Set(['src/example.tsx:setMessage:saved']);
  assert.equal(
    check('setMessage("saved")', 'src/example.tsx', controls).length,
    0
  );
  assert.equal(
    check('setMessage("saved")', 'src/another.tsx', controls).length,
    1
  );
  assert.equal(
    check('setError("saved")', 'src/example.tsx', controls).length,
    1
  );
});

test('checks local constant aliases without capturing shadowed callback data', () => {
  assert.equal(
    check('const message = "Saved in English."; addToast(message);').length,
    1
  );
  assert.equal(
    check(
      'const message = "Internal example."; function notify(message) { addToast(message); }'
    ).length,
    0
  );
});

test('does not treat request parameters or provider properties as displayed copy', () => {
  assert.equal(
    check(
      'const result = await axios.post("/api/test", { status: "not tested" }); setMessage(result.message);'
    ).length,
    0
  );
});

const {
  findUnlocalizedDisplayExpressions,
  findUnlocalizedAccessibilityAttributes,
  findUnlocalizedEmailSubjectCopy,
} = require('./api-message-surface-lib.cjs');
const display = (text) =>
  findUnlocalizedDisplayExpressions(
    ts.createSourceFile(
      'src/example.tsx',
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    ),
    'src/example.tsx'
  );
test('rejects untranslated nested display branches while preserving condition data', () => {
  assert.equal(
    display(
      '<span>{type === "movie" ? "Movie" : intl.formatMessage(messages.series)}</span>'
    ).length,
    1
  );
  assert.equal(
    display(
      '<span>{type === "movie" ? intl.formatMessage(messages.movie) : title}</span>'
    ).length,
    0
  );
});
test('preserves protocol schemes and provider branding in display data', () => {
  assert.equal(
    display('<span>{ssl ? "https://" : "http://"}{server}</span>').length,
    0
  );
  assert.equal(
    display('<span>{provider === "mylar" ? "Mylar3" : "Kapowarr"}</span>')
      .length,
    0
  );
});

const accessibility = (text) =>
  findUnlocalizedAccessibilityAttributes(
    ts.createSourceFile(
      'src/example.tsx',
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    ),
    'src/example.tsx'
  );
test('rejects fixed English accessibility attributes but preserves localized or brand values', () => {
  assert.equal(
    accessibility('<section aria-roledescription="carousel" />')[0].text,
    'carousel'
  );
  assert.equal(
    accessibility(
      '<section aria-roledescription={intl.formatMessage(messages.roleDescription)} /><a aria-label="Simkl" />'
    ).length,
    0
  );
});

test('rejects fixed English email subject copy but accepts translated subject values', () => {
  assert.equal(
    findUnlocalizedEmailSubjectCopy(
      'server/templates/email/test-email/subject.pug',
      '!= `Test Notification [${applicationTitle}]`\n'
    )[0].text,
    'Test Notification []'
  );
  assert.equal(
    findUnlocalizedEmailSubjectCopy(
      'server/templates/email/test-email/subject.pug',
      '!= `${testSubject} [${applicationTitle}]`\n'
    ).length,
    0
  );
  assert.equal(
    findUnlocalizedEmailSubjectCopy(
      'server/templates/email/media-issue/subject.pug',
      '!= `${event} - ${mediaName} [${applicationTitle}]`\n'
    ).length,
    0
  );
});
