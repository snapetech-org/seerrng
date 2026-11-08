"""Fail closed when the latest scanner is not covered by reviewed native pins."""
import json
from pathlib import Path
import importlib.util
import os
import sys
import time
import urllib.error
import urllib.request

SUPPORTED_CURRENT = "v0.76.2"


def verify_current(payload):
    if (not isinstance(payload, dict) or payload.get("tag_name") != SUPPORTED_CURRENT
            or payload.get("draft") is not False or payload.get("prerelease") is not False):
        raise ValueError("Current Trivy release changed; review and update its native checksum pins")
    return SUPPORTED_CURRENT


if __name__ == "__main__":
    path = Path(__file__).parent.parent / "setup-gh-cli/download-release-asset.py"
    spec = importlib.util.spec_from_file_location("verified_release", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    opener = urllib.request.build_opener(module.GitHubRedirects())
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    for attempt in range(3):
        request = urllib.request.Request("https://api.github.com/repos/aquasecurity/trivy/releases/latest",
                                         headers={"User-Agent": "SeerrNG-verified-tool-bootstrap", "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"})
        if token:
            request.add_unredirected_header("Authorization", "Bearer " + token)
        try:
            with opener.open(request, timeout=20) as response:
                data = response.read(256 * 1024 + 1)
                if len(data) > 256 * 1024:
                    raise ValueError("Trivy release metadata exceeds its size limit")
            break
        except (urllib.error.URLError, TimeoutError) as error:
            status = getattr(error, "code", None)
            if status in (401, 403) and token:
                token = None
            elif status is not None and status < 500:
                raise RuntimeError(f"Current Trivy metadata request failed ({status})") from None
            if attempt == 2:
                raise RuntimeError("Current Trivy metadata unavailable after bounded retries") from None
            print("Retrying official current-scanner metadata", file=sys.stderr)
            time.sleep(0.25)
    print(verify_current(json.loads(data)))
