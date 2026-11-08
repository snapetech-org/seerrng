"""Use already verified distribution bytes without changing the wrapper version."""
import hashlib
import os
from pathlib import Path
import re
import sys

SHA256 = "bbaeb2fef8710818cf0e261201dab964c572f92b942812df0c3620d62a529a01"
URL = r"https\://services.gradle.org/distributions/gradle-9.6.0-bin.zip"


def configure_wrapper(wrapper, archive):
    wrapper, archive = Path(wrapper), Path(archive)
    root = Path(os.environ["RUNNER_TEMP"]).resolve()
    if (wrapper.is_symlink() or not wrapper.resolve().is_relative_to(Path.cwd().resolve())
            or archive.is_symlink() or not archive.resolve().is_relative_to(root)
            or archive.stat().st_nlink != 1):
        raise ValueError("Wrapper and distribution must remain in their owned directories")
    with archive.open("rb") as source:
        if hashlib.file_digest(source, "sha256").hexdigest() != SHA256:
            raise ValueError("Gradle distribution checksum mismatch")
    original = wrapper.read_text()
    checksums = re.findall(r"^distributionSha256Sum=(.*)$", original, re.MULTILINE)
    urls = re.findall(r"^distributionUrl=(.*)$", original, re.MULTILINE)
    local_url = archive.resolve().as_uri()
    if checksums != [SHA256] or len(urls) != 1 or urls[0] not in (URL, local_url):
        raise ValueError("Unsupported wrapper version, checksum or distribution URL")
    candidate = re.sub(r"^distributionUrl=.*$", lambda _: "distributionUrl=" + local_url,
                       original, flags=re.MULTILINE)
    wrapper.write_text(candidate)
    print("Gradle 9.6.0 wrapper uses verified local bytes; pinned checksum retained")


if __name__ == "__main__":
    configure_wrapper(*sys.argv[1:])
