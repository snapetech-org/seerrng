#!/usr/bin/env python3
"""Install and exercise the SeerrNG bridge in a disposable Jellyfin server."""

from __future__ import annotations

import argparse
import http.client
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from typing import Any


PLUGIN_ID = "812a21b1-2e18-4ff7-a9b8-3dd84e2a0e16"
PLUGIN_NAME = "SeerrNG Bridge"
IMAGE_DEFAULT = (
    "jellyfin/jellyfin@sha256:"
    "aefb67e6a7ff1debdd154a78a7bbb780fd0c873d8639210a7f6a2016ad2b35db"
)
SERVER_VERSION = "10.11.11"
IMAGE_PULL_TIMEOUT_SECONDS = 600
CONTAINER_START_TIMEOUT_SECONDS = 60


class SmokeTestError(RuntimeError):
    """A safe-to-print failure from the disposable integration environment."""


def pull_image(image: str) -> None:
    """Pull the image separately so downloads have a clear, bounded deadline."""
    print(
        "Pulling Jellyfin smoke-test image "
        f"(timeout {IMAGE_PULL_TIMEOUT_SECONDS}s).",
        flush=True,
    )
    try:
        result = subprocess.run(
            ["docker", "pull", "--quiet", image],
            check=False,
            timeout=IMAGE_PULL_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired as error:
        raise SmokeTestError(
            "Timed out pulling the Jellyfin smoke-test image after "
            f"{IMAGE_PULL_TIMEOUT_SECONDS} seconds."
        ) from error
    if result.returncode != 0:
        raise SmokeTestError(
            "Docker could not pull the Jellyfin smoke-test image "
            f"(exit {result.returncode})."
        )


def run(command: list[str], *, timeout: int = 120) -> str:
    result = subprocess.run(
        command,
        check=False,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    if result.returncode != 0:
        raise SmokeTestError(
            f"Command failed ({result.returncode}): {' '.join(command)}"
        )
    return result.stdout.strip()


def api_request(
    base_url: str,
    # nosemgrep: bash.lang.security.ifs-tampering.ifs-tampering -- local smoke-test script, not shipped
    path: str,
    *,
    method: str = "GET",
    payload: dict[str, Any] | None = None,
    token: str | None = None,
    include_identity: bool = False,
) -> tuple[int, bytes]:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        f"{base_url}{path}", data=data, method=method
    )
    authorization = (
        'MediaBrowser Client="SeerrNG smoke test", Device="Local QA", '
        'DeviceId="seerrng-jellyfin-bridge-smoke", Version="1.0"'
    )
    if token:
        authorization += f', Token="{token}"'
    if token or include_identity:
        request.add_header("Authorization", authorization)
    if data is not None:
        request.add_header("Content-Type", "application/json")

    try:
        # nosemgrep: python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected -- release/smoke tooling that only calls explicitly configured endpoints
        with urllib.request.urlopen(request, timeout=10) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        try:
            body = error.read()
        except http.client.IncompleteRead as read_error:
            body = read_error.partial
        except (http.client.HTTPException, OSError):
            body = b""
        finally:
            error.close()
        return error.code, body
    except (OSError, TimeoutError, urllib.error.URLError) as error:
        raise SmokeTestError(f"Jellyfin request failed: {method} {path}") from error


def expect_success(
    base_url: str,
    path: str,
    *,
    method: str = "GET",
    payload: dict[str, Any] | None = None,
    token: str | None = None,
) -> bytes:
    status, body = api_request(
        base_url, path, method=method, payload=payload, token=token
    )
    if status < 200 or status >= 300:
        raise SmokeTestError(f"Jellyfin returned HTTP {status}: {method} {path}")
    return body


def wait_for_health(base_url: str, container_name: str) -> None:
    deadline = time.monotonic() + 120
    while time.monotonic() < deadline:
        running = subprocess.run(
            ["docker", "inspect", "--format", "{{.State.Running}}", container_name],
            check=False,
            capture_output=True,
            text=True,
            timeout=10,
        )
        if running.returncode != 0 or running.stdout.strip() != "true":
            logs = subprocess.run(
                ["docker", "logs", "--tail", "80", container_name],
                check=False,
                capture_output=True,
                text=True,
                timeout=10,
            )
            diagnostic_lines = [
                line
                for line in (logs.stdout + logs.stderr).splitlines()
                if "[ERR]" in line
                or "[FTL]" in line
                or "SeerrNG Bridge" in line
            ]
            details = "\n".join(diagnostic_lines[-30:])
            raise SmokeTestError(
                "The Jellyfin container exited before becoming healthy."
                + (f"\n{details}" if details else "")
            )

        try:
            status, _ = api_request(base_url, "/health")
            if status == 200:
                startup_status, _ = api_request(
                    base_url, "/Startup/Configuration"
                )
                if startup_status == 200:
                    return
        except SmokeTestError:
            # Jellyfin can reset the port while Kestrel is still starting.
            pass
        time.sleep(1)

    raise SmokeTestError("Jellyfin did not become healthy within 120 seconds.")


def verify_server(base_url: str) -> None:
    public_info = json.loads(
        expect_success(base_url, "/System/Info/Public").decode("utf-8")
    )
    server_version = next(
        (value for key, value in public_info.items() if key.casefold() == "version"),
        None,
    )
    if server_version != SERVER_VERSION:
        raise SmokeTestError(
            f"Expected Jellyfin {SERVER_VERSION}; received "
            f"{server_version or 'an unknown version'}."
        )

    expect_success(
        base_url,
        "/Startup/Configuration",
        method="POST",
        payload={
            "ServerName": "SeerrNG bridge smoke test",
            "UICulture": "en-US",
            "MetadataCountryCode": "US",
            "PreferredMetadataLanguage": "en",
        },
    )
    # Jellyfin creates the initial user when this route initializes its user manager.
    expect_success(base_url, "/Startup/User")
    password = f"Smoke-{uuid.uuid4()}-Only!"
    expect_success(
        base_url,
        "/Startup/User",
        method="POST",
        payload={"Name": "seerrng-smoke-admin", "Password": password},
    )
    expect_success(
        base_url,
        "/Startup/RemoteAccess",
        method="POST",
        payload={"EnableRemoteAccess": True, "EnableAutomaticPortMapping": False},
    )
    expect_success(base_url, "/Startup/Complete", method="POST", payload={})

    user_status, _ = api_request(
        base_url, "/Plugins/SeerrNGBridge/Configuration"
    )
    if user_status != 401:
        raise SmokeTestError(
            "The bridge configuration endpoint must require authentication; "
            f"Jellyfin returned HTTP {user_status}."
        )

    status, body = api_request(
        base_url,
        "/Users/AuthenticateByName",
        method="POST",
        payload={"Username": "seerrng-smoke-admin", "Pw": password},
        include_identity=True,
    )
    if status != 200:
        raise SmokeTestError(f"Jellyfin admin login returned HTTP {status}.")
    token = json.loads(body).get("AccessToken")
    if not isinstance(token, str) or not token:
        raise SmokeTestError("Jellyfin did not return an admin session token.")

    public_config = json.loads(
        expect_success(
            base_url,
            "/Plugins/SeerrNGBridge/Configuration",
            token=token,
        ).decode("utf-8")
    )
    if public_config.get("seerrNgUrl") != "":
        raise SmokeTestError("The initial SeerrNG URL should be empty.")

    plugin_config_path = f"/Plugins/{PLUGIN_ID}/Configuration"
    plugin_config = json.loads(
        expect_success(base_url, plugin_config_path, token=token).decode("utf-8")
    )
    plugin_config["SeerrNgUrl"] = "https://seerrng.example.test"
    expect_success(
        base_url,
        plugin_config_path,
        method="POST",
        payload=plugin_config,
        token=token,
    )
    public_config = json.loads(
        expect_success(
            base_url,
            "/Plugins/SeerrNGBridge/Configuration",
            token=token,
        ).decode("utf-8")
    )
    if public_config.get("seerrNgUrl") != "https://seerrng.example.test":
        raise SmokeTestError("The bridge did not return its saved SeerrNG URL.")

    pages = json.loads(
        expect_success(base_url, "/web/ConfigurationPages", token=token).decode(
            "utf-8"
        )
    )
    page_names = {page.get("Name") for page in pages if isinstance(page, dict)}
    expected_pages = {"SeerrNGBridge", "SeerrNGBridgeConfiguration"}
    if not expected_pages.issubset(page_names):
        raise SmokeTestError("Jellyfin did not register both SeerrNG dashboard pages.")
    main_page = next(
        page
        for page in pages
        if isinstance(page, dict) and page.get("Name") == "SeerrNGBridge"
    )
    main_menu_enabled = main_page.get(
        "enableInMainMenu", main_page.get("EnableInMainMenu")
    )
    if main_menu_enabled is not True:
        raise SmokeTestError("Jellyfin did not expose the SeerrNG dashboard shortcut.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--plugin-output",
        type=Path,
        required=True,
        help="Directory produced by dotnet publish for the bridge plugin.",
    )
    parser.add_argument("--image", default=IMAGE_DEFAULT)
    args = parser.parse_args()

    assembly = args.plugin_output / "Jellyfin.Plugin.SeerrNGBridge.dll"
    if not assembly.is_file():
        raise SmokeTestError(f"Plugin assembly not found: {assembly}")

    pull_image(args.image)

    container_name = f"seerrng-jellyfin-smoke-{uuid.uuid4().hex[:12]}"
    with tempfile.TemporaryDirectory(
        prefix="seerrng-jellyfin-smoke-", ignore_cleanup_errors=True
    ) as temp_name:
        temp_dir = Path(temp_name)
        config_dir = temp_dir / "config"
        plugin_dir = temp_dir / "plugin"
        temp_dir.chmod(0o755)
        config_dir.mkdir()
        plugin_dir.mkdir()
        config_dir.chmod(0o777)
        shutil.copy2(assembly, plugin_dir / assembly.name)
        shutil.copy2(Path(__file__).with_name("meta.json"), plugin_dir / "meta.json")
        plugin_dir.chmod(0o777)
        for file_path in plugin_dir.iterdir():
            file_path.chmod(0o666)

        container_started = False
        try:
            run(
                [
                    "docker",
                    "run",
                    "--pull=never",
                    "--detach",
                    "--name",
                    container_name,
                    "--publish",
                    "127.0.0.1::8096",
                    "--volume",
                    f"{config_dir}:/config",
                    "--mount",
                    "type=bind,source="
                    f"{plugin_dir},target=/config/plugins/{PLUGIN_NAME}_0.1.0.0",
                    args.image,
                ],
                timeout=CONTAINER_START_TIMEOUT_SECONDS,
            )
            container_started = True
            port_mapping = run(
                ["docker", "port", container_name, "8096/tcp"], timeout=10
            )
            host_port = port_mapping.rsplit(":", 1)[-1]
            if not host_port.isdigit():
                raise SmokeTestError("Docker returned an invalid Jellyfin port.")
            base_url = f"http://127.0.0.1:{host_port}"
            wait_for_health(base_url, container_name)
            verify_server(base_url)
        except Exception:
            try:
                logs = subprocess.run(
                    ["docker", "logs", "--tail", "100", container_name],
                    check=False,
                    capture_output=True,
                    text=True,
                    timeout=10,
                )
            except (OSError, subprocess.TimeoutExpired):
                logs = None
            if logs is not None:
                diagnostic_lines = [
                    line
                    for line in (logs.stdout + logs.stderr).splitlines()
                    if "[ERR]" in line
                    or "[FTL]" in line
                    or "SeerrNG Bridge" in line
                ]
                if diagnostic_lines:
                    print("\n".join(diagnostic_lines[-40:]), file=sys.stderr)
            raise
        finally:
            # Docker can create a container before its client times out. Always
            # remove our unique container name, even when `docker run` failed.
            try:
                subprocess.run(
                    ["docker", "rm", "--force", container_name],
                    check=False,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    timeout=20,
                )
            except (OSError, subprocess.TimeoutExpired) as error:
                print(
                    "WARNING: unable to remove Jellyfin smoke-test container "
                    f"({type(error).__name__}).",
                    file=sys.stderr,
                )
            if container_started:
                try:
                    subprocess.run(
                        [
                            "docker",
                            "run",
                            "--pull=never",
                            "--rm",
                            "--user",
                            "0:0",
                            "--volume",
                            f"{temp_dir}:/smoke-test",
                            "--entrypoint",
                            "/bin/sh",
                            args.image,
                            "-c",
                            f"chown -R {os.getuid()}:{os.getgid()} /smoke-test",
                        ],
                        check=False,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        timeout=30,
                    )
                except (OSError, subprocess.TimeoutExpired) as error:
                    print(
                        "WARNING: unable to restore Jellyfin smoke-test "
                        f"workspace ownership ({type(error).__name__}).",
                        file=sys.stderr,
                    )

    print(
        f"PASS: {PLUGIN_NAME} loaded in Jellyfin {SERVER_VERSION}; authenticated "
        "configuration, settings persistence, and both dashboard pages work."
    )


if __name__ == "__main__":
    try:
        main()
    except SmokeTestError as error:
        raise SystemExit(f"FAIL: {error}") from error
