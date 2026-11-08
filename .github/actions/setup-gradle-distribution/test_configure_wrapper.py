import hashlib
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("wrapper_transport", Path(__file__).with_name("configure-wrapper.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class WrapperTransportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.archive = self.root / "gradle.zip"
        self.archive.write_bytes(b"verified fixture")
        self.digest = hashlib.sha256(self.archive.read_bytes()).hexdigest()
        self.wrapper = self.root / "gradle-wrapper.properties"
        self.original = f"distributionUrl={module.URL}\ndistributionSha256Sum={self.digest}\nnetworkTimeout=10000\n"
        self.wrapper.write_text(self.original)
        self.addCleanup(patch.stopall)
        patch.object(module, "SHA256", self.digest).start()
        patch.dict(os.environ, {"RUNNER_TEMP": str(self.root)}).start()
        patch.object(Path, "cwd", return_value=self.root).start()

    def test_verified_local_transport_retains_checksum_and_other_properties(self):
        module.configure_wrapper(self.wrapper, self.archive)
        expected = self.original.replace(module.URL, self.archive.as_uri())
        self.assertEqual(self.wrapper.read_text(), expected)
        module.configure_wrapper(self.wrapper, self.archive)
        self.assertEqual(self.wrapper.read_text(), expected)

    def rejected(self):
        before = self.wrapper.read_text()
        with self.assertRaises(ValueError):
            module.configure_wrapper(self.wrapper, self.archive)
        self.assertEqual(self.wrapper.read_text(), before)

    def test_archive_tampering_preserves_wrapper(self):
        self.archive.write_bytes(b"tampered")
        self.rejected()

    def test_wrong_wrapper_checksum_is_rejected(self):
        self.wrapper.write_text(self.original.replace(self.digest, "0" * 64))
        self.rejected()

    def test_duplicate_checksums_are_rejected(self):
        self.wrapper.write_text(self.original + f"distributionSha256Sum={self.digest}\n")
        self.rejected()

    def test_duplicate_distribution_urls_are_rejected(self):
        self.wrapper.write_text(self.original + f"distributionUrl={module.URL}\n")
        self.rejected()

    def test_unexpected_distribution_url_is_rejected(self):
        self.wrapper.write_text(self.original.replace(module.URL, "https://attacker.invalid/gradle.zip"))
        self.rejected()

    def test_symlinked_archive_is_rejected(self):
        target = self.archive.with_name("real.zip")
        self.archive.rename(target)
        self.archive.symlink_to(target)
        self.rejected()

    def test_hardlinked_archive_is_rejected(self):
        os.link(self.archive, self.archive.with_name("alias.zip"))
        self.rejected()

    def test_distribution_outside_runner_temp_is_rejected(self):
        patch.dict(os.environ, {"RUNNER_TEMP": str(self.root / "other")}).start()
        self.rejected()

    def test_symlinked_wrapper_is_rejected(self):
        target = self.wrapper.with_name("original.properties")
        self.wrapper.rename(target)
        self.wrapper.symlink_to(target)
        self.rejected()


if __name__ == "__main__":
    unittest.main()
