import hashlib
import importlib.util
import io
import os
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import urllib.error
import urllib.request

spec = importlib.util.spec_from_file_location("download_asset", Path(__file__).with_name("download-release-asset.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class Response(io.BytesIO):
    def __init__(self, data, headers=None):
        super().__init__(data)
        self.headers = headers or {}


class Opener:
    def __init__(self, *responses):
        self.responses = iter(responses)
        self.calls = []

    def open(self, request, timeout):
        self.calls.append(request)
        response = next(self.responses)
        if isinstance(response, Exception):
            raise response
        return response


class VerifiedAssetTests(unittest.TestCase):
    def setUp(self):
        self.scratch = tempfile.TemporaryDirectory()
        self.addCleanup(self.scratch.cleanup)
        self.root = Path(self.scratch.name)
        self.environment = patch.dict(os.environ, {"RUNNER_TEMP": self.scratch.name, "GH_TOKEN": "synthetic-test-token"})
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.payload = b"verified tool bytes"
        self.output = self.root / "tool"

    def download(self, opener, **overrides):
        values = dict(repository="owner/tool", tag="v1.0", asset="tool.tar.gz", asset_id=123,
                      sha256=hashlib.sha256(self.payload).hexdigest(), output=self.output, opener=opener)
        values.update(overrides)
        module.download_asset(**values)

    def test_verified_direct_download_never_receives_token(self):
        opener = Opener(Response(self.payload))
        self.download(opener)
        self.assertEqual(self.output.read_bytes(), self.payload)
        self.assertIsNone(opener.calls[0].get_header("Authorization"))

    def test_cache_is_reused_only_after_rechecking_its_checksum(self):
        self.output.write_bytes(self.payload)
        opener = Opener()
        self.download(opener)
        self.assertFalse(opener.calls)

    def test_transport_failure_retries_only_the_pinned_api_asset(self):
        opener = Opener(urllib.error.URLError("unavailable"), Response(self.payload))
        self.download(opener)
        self.assertEqual(opener.calls[1].full_url, "https://api.github.com/repos/owner/tool/releases/assets/123")
        self.assertEqual(opener.calls[1].get_header("Authorization"), "Bearer synthetic-test-token")
        self.assertEqual(self.output.read_bytes(), self.payload)
        self.assertFalse(list(self.root.glob(".verified-download-*")))

    def test_bad_checksum_keeps_existing_output_and_does_not_try_another_source(self):
        self.output.write_bytes(b"existing")
        opener = Opener(Response(b"wrong"))
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            self.download(opener)
        self.assertEqual(len(opener.calls), 1)
        self.assertEqual(self.output.read_bytes(), b"existing")
        self.assertFalse(list(self.root.glob(".verified-download-*")))

    def test_oversized_response_is_rejected_before_reading(self):
        opener = Opener(Response(self.payload, {"Content-Length": str(module.MAX_BYTES + 1)}))
        with self.assertRaisesRegex(ValueError, "size limit"):
            self.download(opener)
        self.assertFalse(self.output.exists())

    def test_invalid_source_or_checksum_is_rejected_without_network(self):
        for values in [{"repository": "owner/tool/../private"}, {"repository": "../tool"},
                       {"tag": ".."}, {"asset": "."}, {"tag": "../../etc"},
                       {"asset": "file?token=secret"}, {"asset_id": -1}, {"sha256": ""}]:
            opener = Opener()
            with self.assertRaises(ValueError):
                self.download(opener, **values)
            self.assertFalse(opener.calls)

    def test_output_and_symlink_cannot_escape_runner_temp(self):
        opener = Opener()
        with self.assertRaises(ValueError):
            self.download(opener, output=self.root.parent / "outside-tool")
        self.output.symlink_to(self.root / "target")
        with self.assertRaises(ValueError):
            self.download(opener)
        self.assertFalse(opener.calls)

    def test_redirects_strip_credentials_and_require_permitted_https_hosts(self):
        req = urllib.request.Request("https://api.github.com/repos/owner/tool", headers={"Authorization": "Bearer synthetic-test-token"})
        redirect = module.GitHubRedirects().redirect_request(req, None, 302, "", {}, "https://release-assets.githubusercontent.com/tool?signature=synthetic")
        self.assertIsNone(redirect.get_header("Authorization"))
        for url in ["http://github.com/tool", "https://127.0.0.1/tool", "https://github.com.attacker.invalid/tool", "https://@github.com/tool"]:
            with self.assertRaises(ValueError):
                module.validate_url(url)

    def test_archive_traversal_and_links_are_rejected_before_extraction(self):
        for name, member_type in [("../escaped", tarfile.REGTYPE), ("tool", tarfile.SYMTYPE)]:
            archive = self.root / "bad.tar.gz"
            with tarfile.open(archive, "w:gz") as target:
                member = tarfile.TarInfo(name)
                member.type = member_type
                member.linkname = "/etc/passwd" if member_type == tarfile.SYMTYPE else ""
                target.addfile(member)
            with self.assertRaisesRegex(ValueError, "Unsafe"):
                module.extract_archive(archive, self.root / "extract")
            self.assertFalse((self.root / "escaped").exists())


if __name__ == "__main__":
    unittest.main()
