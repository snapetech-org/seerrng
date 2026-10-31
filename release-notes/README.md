# Release-note fragments

For any user-facing change, add one structured fragment under `release-notes/` describing it. A
single fragment may cover related user-facing changes in the same pull request. Keep shipped fragments unchanged. The release
workflow carries these fragments into `CHANGELOG.md`, GitHub Releases, and the
Discord release announcement.

Use a short, user-facing description rather than an implementation detail:

```md
---
category: fixed
audience: users, operators
area: bookshelf
action: none
breaking: false
---

Hardcover-backed book searches now keep working from cached metadata during a short upstream outage.
```

The frontmatter captures the context that is usually lost during a release:

- `category`: `added`, `changed`, `fixed`, `security`, `removed`, or `deprecated`.
- `audience`: `users`, `operators`, or `users, operators`.
- `area`: a short lowercase slug such as `bookshelf`, `metadata`, or
  `release-pipeline`.
- `action`: the required upgrade or operating step, or `none` when no action is
  needed.
- `breaking`: `true` or `false`; breaking changes must include an action.

The body is the release-ready summary: state what changed and why it matters to
the audience. Keep it to 30-400 characters, start with a capitalized sentence,
and end with punctuation. Do not paste commit messages, logs, issue fragments,
or implementation-only details.

Released fragments are immutable. You may refine an upcoming release fragment
before its version tag; after tagging, add a new file instead of rewriting the
shipped history. Preview the exact notes that will be published with:

```bash
pnpm release-notes:preview --base origin/main --head HEAD
```

For internal-only work, no fragment is needed. In a pull request, either select the internal-only
option in the template or put `release-note: none` on its own line in the description. When a
direct push or merge check reads commit messages, put the same marker on its own line in the
commit message.

Dependabot prefixes ordinary dependency-update titles with the same marker so
push validation retains it after a merge.
