#!/usr/bin/env python3
"""Download a pinned public GitHub asset; publish only verified bytes."""

import argparse
import hashlib
import os
from pathlib import Path
import re
import tempfile
import tarfile
import time
import urllib.error
import urllib.parse
import urllib.request

MAX_BYTES = 256 * 1024 * 1024
HOSTS = {"github.com", "api.github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com"}


def validate_url(url):
    parsed = urllib.parse.urlsplit(url)
    if (parsed.scheme != "https" or parsed.hostname not in HOSTS
            or parsed.username is not None or parsed.password is not None
            or parsed.port not in (None, 443)):
        raise ValueError("Release download redirected outside the permitted HTTPS hosts")


class GitHubRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_url(newurl)
        redirected = super().redirect_request(req, fp, code, msg, headers, newurl)
        if redirected is not None:
            redirected.remove_header("Authorization")
        return redirected


def checked_output(output):
    runner_temp = os.environ.get("RUNNER_TEMP")
    if not runner_temp:
        raise ValueError("RUNNER_TEMP is required")
    output = Path(output)
    if output.is_symlink() or not output.resolve().is_relative_to(Path(runner_temp).resolve()):
        raise ValueError("Download output must stay inside RUNNER_TEMP")
    return output


def extract_archive(archive, destination):
    destination = checked_output(destination)
    destination.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive, "r:gz") as source:
        members, size = [], 0
        for member in source:
            size += member.size
            if (len(members) >= 10000 or size > 512 * 1024 * 1024
                    or not (member.isfile() or member.isdir())
                    or not (destination / member.name).resolve().is_relative_to(destination.resolve())):
                raise ValueError("Unsafe release archive member")
            members.append(member)
        source.extractall(destination, members=members, filter="data")


def download_asset(repository, tag, asset, asset_id, sha256, output, opener=None):
    if (not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository)
            or any(part in (".", "..") for part in repository.split("/"))):
        raise ValueError("Invalid GitHub repository")
    if any(part in (".", "..") or not re.fullmatch(r"[A-Za-z0-9._+-]{1,200}", part) for part in (tag, asset)):
        raise ValueError("Invalid release tag or asset name")
    if not isinstance(asset_id, int) or isinstance(asset_id, bool) or asset_id <= 0:
        raise ValueError("Invalid release asset ID")
    if not re.fullmatch(r"[a-f0-9]{64}", sha256):
        raise ValueError("A pinned SHA-256 checksum is required")
    output = checked_output(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.is_file() and output.stat().st_nlink == 1 and output.stat().st_size <= MAX_BYTES:
        with output.open("rb") as existing:
            if hashlib.file_digest(existing, "sha256").hexdigest() == sha256:
                print(f"Reusing verified {asset}")
                return
    opener = opener or urllib.request.build_opener(GitHubRedirects())
    urls = [f"https://github.com/{repository}/releases/download/{tag}/{asset}",
            f"https://api.github.com/repos/{repository}/releases/assets/{asset_id}"]
    for index, url in enumerate(urls):
        headers = {"User-Agent": "SeerrNG-verified-tool-bootstrap", "Accept": "application/octet-stream"}
        req = urllib.request.Request(url, headers=headers)
        token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
        if index and token:
            # This header is never attached to the browser URL or redirected hosts.
            req.add_unredirected_header("Authorization", f"Bearer {token}")
        fd, filename = tempfile.mkstemp(prefix=".verified-download-", dir=output.parent)
        temporary = Path(filename)
        try:
            digest, size, started = hashlib.sha256(), 0, time.monotonic()
            with os.fdopen(fd, "wb") as target, opener.open(req, timeout=20) as response:
                length = response.headers.get("Content-Length")
                if length and (not length.isdigit() or int(length) > MAX_BYTES):
                    raise ValueError("Release asset exceeds the download size limit")
                read = getattr(response, "read1", response.read)
                while chunk := read(1024 * 1024):
                    size += len(chunk)
                    if size > MAX_BYTES or time.monotonic() - started > 120:
                        raise ValueError("Release asset exceeds its size or time limit")
                    digest.update(chunk)
                    target.write(chunk)
            if digest.hexdigest() != sha256:
                raise ValueError("Release asset SHA-256 verification failed")
            os.replace(temporary, output)
            print(f"Verified {asset} via {'GitHub API' if index else 'release URL'}")
            return
        except (urllib.error.URLError, TimeoutError) as error:
            if index:
                code = getattr(error, "code", "transport")
                raise RuntimeError(f"GitHub API asset download failed ({code})") from None
            print("Release URL unavailable; trying the same pinned asset through GitHub API")
        finally:
            temporary.unlink(missing_ok=True)
    raise RuntimeError("Release asset download failed")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("repository", "tag", "asset", "sha256", "output"):
        parser.add_argument("--" + name, required=True)
    parser.add_argument("--asset-id", required=True, type=int)
    parser.add_argument("--extract-to")
    args = vars(parser.parse_args())
    extract_to = args.pop("extract_to")
    download_asset(**args)
    if extract_to:
        extract_archive(args["output"], extract_to)


if __name__ == "__main__":
    main()
