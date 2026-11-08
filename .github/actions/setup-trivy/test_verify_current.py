import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("current_scanner", Path(__file__).with_name("verify-current.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class CurrentScannerTests(unittest.TestCase):
    def test_reviewed_current_stable_release_is_accepted(self):
        self.assertEqual(module.verify_current({"tag_name": "v0.76.2", "draft": False, "prerelease": False}), "v0.76.2")

    def test_new_or_malformed_releases_fail_instead_of_silently_using_an_old_scanner(self):
        for payload in [None, [], {}, {"tag_name": "v0.76.3", "draft": False, "prerelease": False},
                        {"tag_name": "v0.76.2", "draft": True, "prerelease": False},
                        {"tag_name": "v0.76.2", "draft": False, "prerelease": True}]:
            with self.subTest(payload=payload):
                with self.assertRaises(ValueError):
                    module.verify_current(payload)


if __name__ == "__main__":
    unittest.main()
