# Contributing to SeerrNG

All help is welcome and greatly appreciated! If you would like to contribute to the project, the following instructions should get you started...

## Contribute a theme

Themes have their own scoped stylesheet and do not require a UI proxy or changes
in the application’s source. Start with a native layout and make it your own:

```sh
pnpm install
pnpm interface-theme:create my-cinema --from persiusNG --name "My Cinema" --author "Your name"
pnpm interface-theme:validate ./my-cinema
pnpm interface-theme:pack ./my-cinema
```

The [authoring guide](docs/interface-themes/authoring.md) covers independent CSS,
layout choices, local testing, packaging, installation and upgrades. Follow the
[submission guide](docs/interface-themes/submitting.md) to share your source,
package, checksum and screenshots for review. Submitting a community theme does
not require making it a built-in theme or adding executable code.

## Development

### Tools Required

- HTML/Typescript/Javascript editor
- [VSCode](https://code.visualstudio.com/) is recommended. Upon opening the project, a few extensions will be automatically recommended for install.
- [Node.js](https://nodejs.org/en/download/) (Node 24.22.1 or newer in the 24.x line)
- [Pnpm](https://pnpm.io/cli/install)
- [Git](https://git-scm.com/downloads)

### Getting Started

1. Clone the repository and enter the directory:

   ```bash
   git clone https://github.com/snapetech-org/seerrng.git
   cd seerrng/
   ```

2. Install dependencies and start the development environment:

   ```bash
   pnpm install
   pnpm dev
   ```

3. Run the native checks for the code you changed. See the useful commands in
   [README](./README.md).

### Helm Chart

Tools Required:

- [Helm](https://helm.sh/docs/intro/install/)
- [helm-docs](https://github.com/norwoodj/helm-docs)

Steps:

1. Make the necessary changes.
2. Test your changes.
3. Update the `version` in `charts/seerr-chart/Chart.yaml` following [Semantic Versioning (SemVer)](https://semver.org/).
4. Run the `helm-docs` command to regenerate the chart's README.

### Contributing Code

- For user-facing changes, add one validated structured fragment under
  [`release-notes/`](./release-notes/README.md). Internal changes can use the
  `release-note: none` commit trailer.
- Format changed code and run the applicable tests.

### UI Text Style

When adding new UI text, please try to adhere to the following guidelines:

1. Be concise and clear, and use as few words as possible to make your point.
2. Use the Oxford comma where appropriate.
3. Use the appropriate Unicode characters for ellipses, arrows, and other special characters/symbols.
4. Capitalize proper nouns, such as Plex, Radarr, Sonarr, Telegram, Slack, Pushover, etc. Be sure to also use the official capitalization for any abbreviations; e.g., IMDb has a lowercase 'b', whereas TMDB and TheTVDB have a capital 'B'.
5. Title case headings, button text, and form labels. Note that verbs such as "is" should be capitalized, whereas prepositions like "from" should be lowercase (unless as the first or last word of the string, in which case they are also capitalized).
6. Capitalize the first word in validation error messages, dropdowns, and form "tips." These strings should not end in punctuation.
7. Ensure that toast notification strings are complete sentences ending in punctuation.
8. If an additional description or "tip" is required for a form field, it should be styled using the global CSS class `label-tip`.
9. In full sentences, abbreviations like "info" or "auto" should not be used in place of full words, unless referencing the name/label of a specific setting or option which has an abbreviation in its name.
10. Do your best to check for spelling errors and grammatical mistakes.
11. Do not misspell "Seerr."

## Translation

We use [Weblate](https://translate.seerr.dev/projects/seerr/seerr-frontend/) for our translations, and your help with localizing Seerr would be greatly appreciated! If your language is not listed below, please [open a feature request](/../../issues/new/choose).

<a href="https://translate.seerr.dev/engage/seerr/"><img src="https://translate.seerr.dev/widget/seerr/multi-auto.svg" alt="Translation status" /></a>

## Migrations

If you are adding a new feature that requires a database migration, you will need to create 2 migrations: one for SQLite and one for PostgreSQL. Here is how you could do it:

1. Create a PostgreSQL database or use an existing one:

```bash
sudo docker run --name postgres-seerr -e POSTGRES_PASSWORD=postgres -d -p 127.0.0.1:5432:5432/tcp postgres:latest
```

2. Reset the SQLite database and the PostgreSQL database:

```bash
rm config/db/db.*
rm config/settings.*
PGPASSWORD=postgres sudo docker exec -it postgres-seerr /usr/bin/psql -h 127.0.0.1 -U postgres -c "DROP DATABASE IF EXISTS seerr;"
PGPASSWORD=postgres sudo docker exec -it postgres-seerr /usr/bin/psql -h 127.0.0.1 -U postgres -c "CREATE DATABASE seerr;"
```

3. Switch to the `main` branch and create the original database for SQLite and PostgreSQL so that TypeORM can automatically generate the migrations:

```bash
git switch main
pnpm i
rm -r .next dist; pnpm build
pnpm start
DB_TYPE="postgres" DB_USER=postgres DB_PASS=postgres pnpm start
```

(You can shutdown the server once the message "Server ready on 5055" appears)

4. Let TypeORM generate the migrations:

```bash
git switch -c your-feature-branch
pnpm i
pnpm migration:generate server/migration/sqlite/YourMigrationName
DB_TYPE="postgres" DB_USER=postgres DB_PASS=postgres pnpm migration:generate server/migration/postgres/YourMigrationName
```

## Attribution

SeerrNG is a fork of Seerr. Preserve upstream attribution for inherited files
and behavior. New SeerrNG-specific files, packaging, workflows, and repo
metadata should be attributed to snapetech and SeerrNG contributors unless they
explicitly derive from another source.

See [NOTICE.md](./NOTICE.md) for the project attribution policy. The pre-commit
attribution check catches common mistakes, especially fresh files or repository
metadata that still present SeerrNG work as upstream Seerr output.

This contribution guide was inspired by the [Next.js](https://github.com/vercel/next.js), [Radarr](https://github.com/Radarr/Radarr), and [Ghostty](https://github.com/ghostty-org/ghostty) contribution guides. In addition, our AI policy draws from [Jellyfin's LLM policies](https://jellyfin.org/docs/general/contributing/llm-policies/).
