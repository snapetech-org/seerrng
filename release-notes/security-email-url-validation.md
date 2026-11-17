---
category: security
audience: users, operators
area: notifications
action: upgrade
breaking: false
---
Email templates validate links and remote images at rendering time, allowing HTTP(S) URLs while rejecting executable schemes, embedded credentials and control characters. CSS image URLs also escape delimiter characters. AppImage packaging now pins and verifies the Next.js 16.4.5 WASM compiler required by the security update.
