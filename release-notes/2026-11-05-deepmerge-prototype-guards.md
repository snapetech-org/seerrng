---
category: security
audience: users, operators
area: dependencies
action: none
breaking: false
---

Harden deepmerge's server, documentation and Formik dependency paths against prototype keys copied from either merge operand. The local patches also repair the UMD bundle guard and add coverage for CommonJS, UMD and ESM entrypoints while preserving ordinary nested and array merges.
