# PR #418 W3820-W3839 independent cross-audit and application

The cross-audit directory contains the pinned candidate-free inputs, primary and blind reviews, independent cross ledger, source/runtime/catalog evidence, verifier, and checksum manifest. Its verifier reproduces the 240-cell reconciliation against base head 6c489a64782d31fee70a6aeef386c88527b33083 and tree 9bbf55986a34e9a2bc0c4027205927df65f8754b; all 83 covered-file checksums pass.

The application directory records the 19 cross-adopted proposals applied to catalog commit 3786de8f8334c6f69924e2f88e363f129d3b3943 (tree b4fbc12bace0fc1ac6a650badc444fe3fa0e8724), together with exact guards, a 240-cell committed-tree readback, and a verifier.

Cross dispositions: 219 accept-current, 19 accept-primary-proposal, 2 hold. The Arabic W3828 compatibility terminology and Indonesian W3833 help-text referent remain held. The PR remains a draft and no native-speaker signoff or visual acceptance is claimed. No tests, builds, checks, or CI were run.
