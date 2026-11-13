import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const waiterPath =
  process.env.WAITER_SCRIPT ??
  path.join(scriptsDirectory, 'wait-for-launchpad-ppa.py');

test('reports a published source through its stable self link', () => {
  const python = [
    'import contextlib',
    'import importlib.util',
    'import io',
    'import sys',
    'import types',
    'from datetime import datetime, timezone',
    'sys.dont_write_bytecode = True',
    '',
    'launchpadlib = types.ModuleType("launchpadlib")',
    'launchpadlib.__path__ = []',
    'launchpad_module = types.ModuleType("launchpadlib.launchpad")',
    'launchpad_module.Launchpad = object',
    'sys.modules["launchpadlib"] = launchpadlib',
    'sys.modules["launchpadlib.launchpad"] = launchpad_module',
    '',
    'spec = importlib.util.spec_from_file_location("waiter", sys.argv[1])',
    'waiter = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(waiter)',
    '',
    'source_link = "https://api.launchpad.net/1.0/+sourcepub/12345"',
    'binary = types.SimpleNamespace(',
    '    binary_package_name="seerrng",',
    '    status="Published",',
    '    web_link="https://launchpad.net/+binarypub/67890",',
    ')',
    'build = types.SimpleNamespace(',
    '    arch_tag="amd64",',
    '    buildstate="Successfully built",',
    ')',
    '',
    'class SourcePublication:',
    '    status = "Published"',
    '    date_created = datetime.now(timezone.utc)',
    '    self_link = source_link',
    '',
    '    def getBuilds(self):',
    '        return [build]',
    '',
    '    def getPublishedBinaries(self):',
    '        return [binary]',
    '',
    'class Archive:',
    '    def getPublishedSources(self, **kwargs):',
    '        return [SourcePublication()]',
    '',
    'archive = Archive()',
    'client = types.SimpleNamespace(',
    '    load=lambda archive_url: archive,',
    '    distributions={',
    '        "ubuntu": types.SimpleNamespace(',
    '            getSeries=lambda name_or_version: object()',
    '        )',
    '    },',
    ')',
    'waiter.create_launchpad_client = lambda: client',
    'sys.argv = [',
    '    waiter.__file__,',
    '    "--archive-url", "https://api.launchpad.net/1.0/~owner/+archive/ubuntu/seerrng",',
    '    "--archive-web", "https://launchpad.net/~owner/+archive/ubuntu/seerrng",',
    '    "--series", "jammy",',
    '    "--source-version", "3.41.1+ppa1",',
    '    "--timeout-minutes", "1",',
    ']',
    '',
    'output = io.StringIO()',
    'with contextlib.redirect_stdout(output):',
    '    status = waiter.main()',
    '',
    'assert status == 0, output.getvalue()',
    'assert source_link in output.getvalue(), output.getvalue()',
    'assert "Published binary:" in output.getvalue(), output.getvalue()',
  ].join('\n');
  const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';
  const result = spawnSync(pythonCommand, ['-c', python, waiterPath], {
    encoding: 'utf8',
  });

  assert.equal(
    result.status,
    0,
    'Launchpad publication regression failed.\n' +
      result.stdout +
      '\n' +
      result.stderr
  );
});

test('classifies only Launchpad’s known source-publication race for a retry', () => {
  const python = [
    'import importlib.util',
    'import io',
    'import sys',
    'import types',
    'sys.dont_write_bytecode = True',
    '',
    'launchpadlib = types.ModuleType("launchpadlib")',
    'launchpadlib.__path__ = []',
    'launchpad_module = types.ModuleType("launchpadlib.launchpad")',
    'launchpad_module.Launchpad = object',
    'sys.modules["launchpadlib"] = launchpadlib',
    'sys.modules["launchpadlib.launchpad"] = launchpad_module',
    '',
    'spec = importlib.util.spec_from_file_location("waiter", sys.argv[1])',
    'waiter = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(waiter)',
    '',
    'build = types.SimpleNamespace(',
    '    upload_log_url="https://launchpad.net/upload.log",',
    '    web_link="https://launchpad.net/+build/12345",',
    ')',
    'waiter.urlopen = lambda url, timeout: io.BytesIO(sys.stdin.buffer.read())',
    'try:',
    '    waiter.classify_failed_upload(build, "https://launchpad.net/~owner/+archive/ubuntu/seerrng", "3.41.2+ppa123.1.1~jammy", "jammy")',
    'except waiter.FreshUploadRequired:',
    '    if sys.argv[2] != "known":',
    '        raise',
    'else:',
    '    raise AssertionError("known upload race was not classified for retry")',
  ].join('\n');
  const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';

  for (const [label, log] of [
    [
      'known',
      'Unable to find source publication seerrng/3.41.2+ppa123.1.1~jammy in jammy',
    ],
    ['unknown', 'Launchpad upload rejected for an unrelated reason'],
  ]) {
    const result = spawnSync(pythonCommand, ['-c', python, waiterPath, label], {
      encoding: 'utf8',
      input: log,
    });

    if (label === 'known') {
      assert.equal(
        result.status,
        0,
        'the known source-publication race was not isolated\n' +
          result.stdout +
          result.stderr
      );
    } else {
      assert.notEqual(result.status, 0, 'unclassified upload errors must fail');
      assert.match(
        result.stderr,
        /does not match the known source-publication race/
      );
    }
  }
});

test('uses short unique source versions for each bounded Launchpad attempt', () => {
  const python = [
    'import importlib.util',
    'import sys',
    'import types',
    'sys.dont_write_bytecode = True',
    'spec = importlib.util.spec_from_file_location("publisher", sys.argv[1])',
    'publisher = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(publisher)',
    'args = types.SimpleNamespace(upstream_version="3.40.0", run_id="36638923093", run_attempt="1", series="jammy")',
    'versions = [publisher.package_version(args, attempt) for attempt in (1, 2)]',
    'assert versions[0] != versions[1], versions',
    'assert all(len(version) <= 32 for version in versions), versions',
    'assert versions == ["3.40.0+ppa36638923093.1.1~jammy", "3.40.0+ppa36638923093.1.2~jammy"], versions',
  ].join('\n');
  const publisherPath = path.join(scriptsDirectory, 'publish-launchpad-ppa.py');
  const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';
  const result = spawnSync(pythonCommand, ['-c', python, publisherPath], {
    encoding: 'utf8',
  });

  assert.equal(
    result.status,
    0,
    'Launchpad source version naming regression failed.\n' +
      result.stdout +
      '\n' +
      result.stderr
  );
});

test('does not resubmit a long-running build based only on its age', () => {
  const python = [
    'import importlib.util',
    'import sys',
    'import types',
    'from datetime import datetime, timezone',
    'sys.dont_write_bytecode = True',
    '',
    'launchpadlib = types.ModuleType("launchpadlib")',
    'launchpadlib.__path__ = []',
    'launchpad_module = types.ModuleType("launchpadlib.launchpad")',
    'launchpad_module.Launchpad = object',
    'sys.modules["launchpadlib"] = launchpadlib',
    'sys.modules["launchpadlib.launchpad"] = launchpad_module',
    '',
    'spec = importlib.util.spec_from_file_location("waiter", sys.argv[1])',
    'waiter = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(waiter)',
    '',
    'archive_web = "https://launchpad.net/~owner/+archive/ubuntu/seerrng"',
    'build = types.SimpleNamespace(',
    '    arch_tag="amd64",',
    '    buildstate="Uploading build",',
    '    datebuilt=datetime(2020, 1, 1, tzinfo=timezone.utc),',
    '    web_link="https://launchpad.net/+build/12345",',
    ')',
    'publication = types.SimpleNamespace(',
    '    status="Published",',
    '    self_link="https://api.launchpad.net/1.0/+sourcepub/12345",',
    '    date_created=datetime.now(timezone.utc),',
    '    getBuilds=lambda: [build],',
    '    getPublishedBinaries=lambda: [],',
    ')',
    'archive = types.SimpleNamespace(getPublishedSources=lambda **kwargs: [publication])',
    'client = types.SimpleNamespace(load=lambda url: archive, distributions={"ubuntu": types.SimpleNamespace(getSeries=lambda name_or_version: object())})',
    'waiter.create_launchpad_client = lambda: client',
    'clock = {"now": 0}',
    'waiter.time.monotonic = lambda: clock["now"]',
    'def advance_clock(seconds):',
    '    clock["now"] += seconds',
    'waiter.time.sleep = advance_clock',
    'sys.argv = [waiter.__file__, "--archive-url", "https://api.launchpad.net/1.0/archive", "--archive-web", archive_web, "--series", "jammy", "--source-version", "3.41.2+ppa1", "--timeout-minutes", "1"]',
    'status = waiter.main()',
    'assert status == 1, "a stale nonterminal build must wait for the overall timeout"',
  ].join('\n');
  const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';
  const result = spawnSync(pythonCommand, ['-c', python, waiterPath], {
    encoding: 'utf8',
  });

  assert.equal(
    result.status,
    0,
    'stalled Launchpad binary recovery regression failed.\n' +
      result.stdout +
      '\n' +
      result.stderr
  );
});

test('retries transient Launchpad API failures within the original deadline', () => {
  const python = [
    'import importlib.util',
    'import sys',
    'import types',
    'from datetime import datetime, timezone',
    'from http.client import RemoteDisconnected',
    'from urllib.error import HTTPError',
    'sys.dont_write_bytecode = True',
    '',
    'launchpadlib = types.ModuleType("launchpadlib")',
    'launchpadlib.__path__ = []',
    'launchpad_module = types.ModuleType("launchpadlib.launchpad")',
    'launchpad_module.Launchpad = object',
    'sys.modules["launchpadlib"] = launchpadlib',
    'sys.modules["launchpadlib.launchpad"] = launchpad_module',
    '',
    'spec = importlib.util.spec_from_file_location("waiter", sys.argv[1])',
    'waiter = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(waiter)',
    '',
    'source_link = "https://api.launchpad.net/1.0/+sourcepub/12345"',
    'binary = types.SimpleNamespace(binary_package_name="seerrng", status="Published", web_link="https://launchpad.net/+binarypub/67890")',
    'build = types.SimpleNamespace(arch_tag="amd64", buildstate="Successfully built")',
    'publication = types.SimpleNamespace(',
    '    status="Published",',
    '    date_created=datetime.now(timezone.utc),',
    '    self_link=source_link,',
    '    getBuilds=lambda: [build],',
    '    getPublishedBinaries=lambda: [binary],',
    ')',
    'attempts = {"count": 0}',
    'def get_sources(**kwargs):',
    '    attempts["count"] += 1',
    '    if attempts["count"] == 1:',
    '        raise RemoteDisconnected("Remote end closed connection without response")',
    '    return [publication]',
    'archive = types.SimpleNamespace(getPublishedSources=get_sources)',
    'client = types.SimpleNamespace(',
    '    load=lambda url: archive,',
    '    distributions={"ubuntu": types.SimpleNamespace(getSeries=lambda name_or_version: object())},',
    ')',
    'waiter.create_launchpad_client = lambda: client',
    'clock = {"now": 0}',
    'waiter.time.monotonic = lambda: clock["now"]',
    'def advance_clock(seconds):',
    '    clock["now"] += seconds',
    'waiter.time.sleep = advance_clock',
    'sys.argv = [waiter.__file__, "--archive-url", "https://api.launchpad.net/1.0/archive", "--archive-web", "https://launchpad.net/~owner/+archive/ubuntu/seerrng", "--series", "jammy", "--source-version", "3.41.2+ppa1", "--timeout-minutes", "2"]',
    'assert waiter.is_transient_launchpad_error(HTTPError("https://api.launchpad.net", 503, "unavailable", {}, None))',
    'assert not waiter.is_transient_launchpad_error(HTTPError("https://api.launchpad.net", 403, "forbidden", {}, None))',
    'ApiError = type("ApiError", (Exception,), {"status": 503})',
    'assert waiter.is_transient_launchpad_error(ApiError("service unavailable"))',
    'status = waiter.main()',
    'assert status == 0, status',
    'assert attempts["count"] == 2, attempts',
  ].join('\n');
  const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';
  const result = spawnSync(pythonCommand, ['-c', python, waiterPath], {
    encoding: 'utf8',
  });

  assert.equal(
    result.status,
    0,
    'transient Launchpad API retry regression failed.\n' +
      result.stdout +
      '\n' +
      result.stderr
  );
});

test('times out when an accepted upload has no source record instead of resubmitting', () => {
  const python = [
    'import contextlib',
    'import importlib.util',
    'import io',
    'import sys',
    'import types',
    'sys.dont_write_bytecode = True',
    '',
    'launchpadlib = types.ModuleType("launchpadlib")',
    'launchpadlib.__path__ = []',
    'launchpad_module = types.ModuleType("launchpadlib.launchpad")',
    'launchpad_module.Launchpad = object',
    'sys.modules["launchpadlib"] = launchpadlib',
    'sys.modules["launchpadlib.launchpad"] = launchpad_module',
    '',
    'spec = importlib.util.spec_from_file_location("waiter", sys.argv[1])',
    'waiter = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(waiter)',
    '',
    'class Archive:',
    '    def getPublishedSources(self, **kwargs):',
    '        return []',
    '',
    'archive = Archive()',
    'client = types.SimpleNamespace(',
    '    load=lambda archive_url: archive,',
    '    distributions={',
    '        "ubuntu": types.SimpleNamespace(',
    '            getSeries=lambda name_or_version: object()',
    '        )',
    '    },',
    ')',
    'waiter.create_launchpad_client = lambda: client',
    '',
    'clock = {"now": 0}',
    'waiter.time.monotonic = lambda: clock["now"]',
    'def advance_clock(seconds):',
    '    clock["now"] += seconds',
    'waiter.time.sleep = advance_clock',
    'sys.argv = [',
    '    waiter.__file__,',
    '    "--archive-url", "https://api.launchpad.net/1.0/~owner/+archive/ubuntu/seerrng",',
    '    "--archive-web", "https://launchpad.net/~owner/+archive/ubuntu/seerrng",',
    '    "--series", "jammy",',
    '    "--source-version", "3.41.2+ppa1",',
    '    "--timeout-minutes", "60",',
    ']',
    '',
    'output = io.StringIO()',
    'with contextlib.redirect_stderr(output):',
    '    status = waiter.main()',
    '',
    'assert status == 1, output.getvalue()',
    'assert "Timed out waiting" in output.getvalue(), output.getvalue()',
  ].join('\n');
  const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';
  const result = spawnSync(pythonCommand, ['-c', python, waiterPath], {
    encoding: 'utf8',
  });

  assert.equal(
    result.status,
    0,
    'missing Launchpad source publication regression failed.\n' +
      result.stdout +
      '\n' +
      result.stderr
  );
});
