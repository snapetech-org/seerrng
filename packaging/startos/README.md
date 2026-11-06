# StartOS Handoff

The separate [SeerrNG StartOS wrapper](https://github.com/snapetech-org/seerrng-startos)
owns its SDK, image pin, package builds and sideload verification. This directory
contains a submission draft only; it is not a compiled StartOS package.

The wrapper's current README still targets v3.27.1. Update and validate that
wrapper against a published SeerrNG image, then verify installation, persistence,
update and restart on StartOS before submitting it. Do not describe the current
SeerrNG release as StartOS-qualified based on this handoff file.

Runtime contract: HTTP port 5055, persistent `/app/config`, Linux amd64/arm64.
The [release matrix](../../docs/maintainers/release-matrix.md) determines which
artifacts this repository actually publishes. The draft email must be filled
with the qualified wrapper commit and package version before it is sent.
