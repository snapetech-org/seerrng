#!/usr/bin/env python3
"""Wait for a PPA source and binary publication using Launchpad's public API.

Exit status 2 means a fresh source version is needed to recover from the
classified source-publication race. Time spent in a nonterminal Launchpad state
is never treated as evidence that an upload failed.
"""

from __future__ import annotations

import argparse
import gzip
from http.client import HTTPException
from socket import gaierror
import sys
import time
from datetime import datetime
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

from launchpadlib.launchpad import Launchpad


POLL_INTERVAL_SECONDS = 60
PUBLISHED = "Published"
TRANSIENT_HTTP_STATUS_CODES = {408, 425, 429, 500, 502, 503, 504}


class FreshUploadRequired(RuntimeError):
    """Launchpad needs a fresh source version to recover the PPA build."""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive-url", required=True)
    parser.add_argument("--archive-web", required=True)
    parser.add_argument("--series", choices=("jammy", "noble"), required=True)
    parser.add_argument("--source-version", required=True)
    parser.add_argument("--timeout-minutes", type=int, default=150)
    return parser.parse_args()


def create_launchpad_client() -> Launchpad:
    # This client is deliberately anonymous and read-only. Upload authorization
    # continues to come from the GPG-signed source package and PPA permissions.
    return Launchpad.login_anonymously(
        "seerrng-ppa-monitor",
        service_root="production",
        version="1.0",
    )


def matching_source_publications(
    archive: Any, series: Any, source_version: str
) -> list[Any]:
    return list(
        archive.getPublishedSources(
            source_name="seerrng",
            version=source_version,
            distro_series=series,
            exact_match=True,
            pocket="Release",
        )
    )


def get_builds(source_publication: Any) -> list[Any]:
    return list(source_publication.getBuilds())


def is_transient_launchpad_error(error: Exception) -> bool:
    """Return whether a public Launchpad read can safely be retried."""
    if isinstance(error, HTTPError):
        return error.code in TRANSIENT_HTTP_STATUS_CODES
    if isinstance(error, URLError):
        reason = error.reason
        return isinstance(reason, (ConnectionError, TimeoutError, gaierror, HTTPException)) or (
            isinstance(reason, str)
            and any(
                marker in reason.lower()
                for marker in (
                    "timed out",
                    "temporarily unavailable",
                    "temporary failure",
                    "remote end closed",
                    "connection closed",
                    "connection refused",
                    "connection reset",
                )
            )
        )
    if isinstance(error, (ConnectionError, TimeoutError, gaierror, HTTPException)):
        return True

    if type(error).__name__ == "ServerNotFoundError":
        return True

    response = getattr(error, "response", None)
    status = (
        getattr(response, "status", None)
        or getattr(error, "status", None)
        or getattr(error, "code", None)
    )
    return status in TRANSIENT_HTTP_STATUS_CODES


def classify_failed_upload(
    build: Any,
    archive_web: str,
    source_version: str,
    series: str,
) -> None:
    upload_log_url = build.upload_log_url
    if not upload_log_url:
        build_link = getattr(build, "web_link", None) or getattr(
            build, "self_link", "an unknown Launchpad build"
        )
        raise RuntimeError(
            f"Launchpad marked {build_link} as 'Failed to upload' without an "
            "upload log; refusing to republish an unclassified failure."
        )

    # nosemgrep: python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected -- release/smoke tooling that only calls explicitly configured endpoints
    with urlopen(upload_log_url, timeout=30) as response:
        upload_log = response.read()
    if upload_log_url.endswith(".gz"):
        upload_log = gzip.decompress(upload_log)
    upload_log_text = upload_log.decode("utf-8", errors="replace")
    expected_error = (
        f"Unable to find source publication seerrng/{source_version} in {series}"
    )
    if expected_error not in upload_log_text:
        build_link = getattr(build, "web_link", None) or getattr(
            build, "self_link", "an unknown Launchpad build"
        )
        raise RuntimeError(
            f"Launchpad marked {build_link} as 'Failed to upload', but its log "
            "does not match the known source-publication race. "
            f"Inspect {upload_log_url}."
        )

    raise FreshUploadRequired(
        f"Launchpad rejected the binary for {source_version} before its source "
        f"publication was available. A fresh signed source version can be uploaded "
        f"to {archive_web}. Build log: {upload_log_url}"
    )


def fail_for_build(build: Any) -> None:
    state = build.buildstate
    build_link = getattr(build, "web_link", None) or getattr(
        build, "self_link", "an unknown Launchpad build"
    )
    log_url = build.upload_log_url or build.build_log_url or build_link
    raise RuntimeError(
        f"Launchpad build {build_link} ended in '{state}'. Inspect {log_url}."
    )


def main() -> int:
    args = parse_args()
    if args.timeout_minutes < 1:
        print("--timeout-minutes must be positive.", file=sys.stderr)
        return 1

    deadline = time.monotonic() + args.timeout_minutes * 60
    last_report = ""
    archive = None
    series = None
    while time.monotonic() < deadline:
        try:
            if archive is None or series is None:
                launchpad = create_launchpad_client()
                archive = launchpad.load(args.archive_url)
                distribution = launchpad.distributions["ubuntu"]
                series = distribution.getSeries(name_or_version=args.series)

            publications = matching_source_publications(
                archive, series, args.source_version
            )
            if not publications:
                report = (
                    f"Waiting for {args.source_version} source publication in "
                    f"{args.series} ({args.archive_web})."
                )
            else:
                publication = max(publications, key=lambda item: item.date_created)
                publication_status = publication.status
                builds = get_builds(publication)
                binary_publications = list(publication.getPublishedBinaries())
                binaries = [
                    binary
                    for binary in binary_publications
                    if binary.binary_package_name == "seerrng"
                    and binary.status == PUBLISHED
                    and getattr(
                        binary, "binary_package_version", args.source_version
                    )
                    == args.source_version
                ]
                amd64_builds = [
                    build for build in builds if build.arch_tag == "amd64"
                ]

                for build in amd64_builds:
                    if build.buildstate == "Failed to upload":
                        classify_failed_upload(
                            build,
                            args.archive_web,
                            args.source_version,
                            args.series,
                        )
                    if build.buildstate in (
                        "Failed to build",
                        "Build for superseded Source",
                        "Cancelled build",
                    ):
                        fail_for_build(build)

                if publication_status in ("Superseded", "Deleted", "Obsolete"):
                    raise RuntimeError(
                        f"Launchpad source publication {publication.self_link} "
                        f"ended in '{publication_status}'."
                    )

                if not amd64_builds and publication_status == PUBLISHED:
                    raise RuntimeError(
                        f"No amd64 build record exists for {publication.self_link}."
                    )

                completed = bool(amd64_builds) and all(
                    build.buildstate == "Successfully built"
                    for build in amd64_builds
                )
                if completed and binaries:
                    print(
                        f"Published {args.source_version} for {args.series}: "
                        f"{publication.self_link}",
                        flush=True,
                    )
                    for binary in binaries:
                        binary_link = (
                            getattr(binary, "web_link", None)
                            or getattr(binary, "self_link", None)
                            or getattr(
                                binary, "binary_package_version", args.source_version
                            )
                        )
                        print(f"Published binary: {binary_link}", flush=True)
                    return 0

                states = ", ".join(
                    f"{build.arch_tag}={build.buildstate}" for build in amd64_builds
                ) or "no build records"
                binary_states = ", ".join(
                    f"{binary.binary_package_name}={binary.status}"
                    for binary in binary_publications
                ) or "no binary publication records"
                if publication_status != PUBLISHED:
                    report = (
                        f"Waiting for source publication {publication.self_link} "
                        f"to become Published (currently {publication_status}; "
                        f"builds [{states}], binaries [{binary_states}])."
                    )
                else:
                    report = (
                        f"Waiting for binary publication in {args.series}: "
                        f"builds [{states}], binaries [{binary_states}]."
                    )

            if report != last_report:
                print(report, flush=True)
                last_report = report
        except FreshUploadRequired as error:
            print(error, file=sys.stderr)
            return 2
        except Exception as error:
            if not is_transient_launchpad_error(error):
                print(f"Launchpad publication check failed: {error}", file=sys.stderr)
                return 1

            report = (
                "Temporary Launchpad API error; retrying within the existing "
                f"timeout: {error}"
            )
            if report != last_report:
                print(report, flush=True)
                last_report = report

        time.sleep(min(POLL_INTERVAL_SECONDS, max(deadline - time.monotonic(), 0)))

    print(
        f"Timed out waiting for {args.source_version} and its published binary "
        f"in {args.series}. Check {args.archive_web}.",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
