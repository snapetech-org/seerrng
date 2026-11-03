"""Unit tests for transient startup responses in the Jellyfin smoke test."""

from __future__ import annotations

import http.client
import importlib.util
from types import SimpleNamespace
import urllib.error
import unittest
from pathlib import Path
from unittest.mock import patch


SMOKE_TEST_PATH = Path(__file__).resolve().parents[1] / "smoke-test.py"
SPEC = importlib.util.spec_from_file_location("jellyfin_smoke_test", SMOKE_TEST_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Unable to load the Jellyfin smoke-test module.")
smoke_test = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(smoke_test)


class IncompleteErrorBody:
    def read(self) -> bytes:
        raise http.client.IncompleteRead(b"partial response")

    def close(self) -> None:
        pass


class JellyfinSmokeTestHttpErrorTests(unittest.TestCase):
    def test_incomplete_503_body_is_returned_as_a_retryable_status(self) -> None:
        error = urllib.error.HTTPError(
            "http://127.0.0.1:8096/Startup/Configuration",
            503,
            "Service Unavailable",
            {},
            IncompleteErrorBody(),
        )

        with patch.object(smoke_test.urllib.request, "urlopen", side_effect=error):
            status, body = smoke_test.api_request(
                "http://127.0.0.1:8096", "/Startup/Configuration"
            )

        self.assertEqual(status, 503)
        self.assertEqual(body, b"partial response")

    def test_health_poll_retries_startup_503_until_configuration_is_ready(self) -> None:
        response_statuses = [(200, b""), (503, b""), (200, b""), (200, b"")]
        running_container = SimpleNamespace(returncode=0, stdout="true")

        with (
            patch.object(
                smoke_test.subprocess, "run", return_value=running_container
            ),
            patch.object(
                smoke_test, "api_request", side_effect=response_statuses
            ) as request,
            patch.object(smoke_test.time, "sleep") as sleep,
        ):
            smoke_test.wait_for_health("http://127.0.0.1:8096", "jellyfin-test")

        self.assertEqual(request.call_count, 4)
        sleep.assert_called_once_with(1)


class JellyfinSmokeTestImageTests(unittest.TestCase):
    def test_image_pull_is_separate_and_has_a_ten_minute_deadline(self) -> None:
        result = SimpleNamespace(returncode=0)
        image = "jellyfin/jellyfin@sha256:" + "a" * 64

        with patch.object(smoke_test.subprocess, "run", return_value=result) as run:
            smoke_test.pull_image(image)

        self.assertEqual(
            run.call_args.args[0], ["docker", "pull", "--quiet", image]
        )
        self.assertEqual(
            run.call_args.kwargs["timeout"], smoke_test.IMAGE_PULL_TIMEOUT_SECONDS
        )
        self.assertNotIn("capture_output", run.call_args.kwargs)

    def test_image_pull_timeout_has_a_specific_actionable_error(self) -> None:
        with (
            patch.object(
                smoke_test.subprocess,
                "run",
                side_effect=smoke_test.subprocess.TimeoutExpired("docker pull", 600),
            ),
            self.assertRaisesRegex(smoke_test.SmokeTestError, "Timed out pulling"),
        ):
            smoke_test.pull_image(smoke_test.IMAGE_DEFAULT)

    def test_image_pull_failure_is_reported(self) -> None:
        with (
            patch.object(
                smoke_test.subprocess,
                "run",
                return_value=SimpleNamespace(returncode=1),
            ),
            self.assertRaisesRegex(smoke_test.SmokeTestError, "could not pull"),
        ):
            smoke_test.pull_image(smoke_test.IMAGE_DEFAULT)


if __name__ == "__main__":
    unittest.main()
