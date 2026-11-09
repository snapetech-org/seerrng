---
title: Override Rules
description: Set service-specific request defaults based on media and requester conditions.
---

# Override Rules

Override rules let an administrator route matching movie, series, or music
requests with a specific root folder, quality profile, or set of tags. Rules
can also fill in request options when a requester opens **Advanced Options**.

## Create a rule

1. Open **Settings > Services** and go to **Override Rules**.
2. Select **New Override Rule** and choose the Radarr, Sonarr, or Lidarr
   service the rule applies to.
3. For Radarr or Sonarr, choose any optional user, genre, language, keyword, or
   production-country conditions. Production countries come from the title's
   TMDB metadata; up to 100 countries can be selected. For Lidarr, rules match
   the selected requester.
4. Choose the root folder, quality profile, and tags the rule should set.
   Sonarr services that expose language profiles also let you select a
   language profile. Radarr's quality profile can represent the preferred
   language through the profile's own settings.
5. Save the rule.

The service must be connected and its root folders, profiles, and tags must be
available to SeerrNG. The condition fields shown depend on the selected
service.

## How matching works

For Radarr and Sonarr rules, every condition field you set must match the
request. Within a field, matching any one of its selected values is enough.
For example, if a rule has both a user and a genre condition, both the
requester and at least one selected genre must match. A production-country
condition matches when at least one selected country is present in the movie's
or series' TMDB production-country metadata. If TMDB has no production-country
metadata for the title, that condition does not match. Country matching uses
the country codes returned by TMDB, not the title's original language or a
studio's country. Lidarr rules are matched to the selected requester.

If multiple rules match, SeerrNG applies the rule with the most condition
fields. When matching rules have the same number of conditions, the older rule
takes precedence. A rule's selected tags are added to the request's existing
tags.

Country conditions are available only on Radarr and Sonarr rules. If a title
does not match, SeerrNG continues with the next matching rule or the selected
service's normal settings.

In **Advanced Options**, choose the requester, service, and media options as
usual. When a saved rule matches a movie or series request, its configured
root folder, quality profile, and tags are applied to the form so they can be
reviewed before submitting. For Sonarr, a matching language profile is also
selected when the connected version exposes language profiles. An explicit
language profile chosen by the requester is preserved. Sonarr v5 metadata
language remains a separate lookup setting and is not changed by this rule.

An explicitly selected value takes precedence; an
untouched default can still be supplied by the matching rule when the request
is created. Displayed service and account defaults are not automatically
treated as choices that block a rule. If you deliberately select a value
already shown as the default, SeerrNG keeps that selection and the rule does
not replace it.

When editing a pending request, choose the connected service's configured
default to clear a saved override. See [Request Defaults and Overrides](./request-defaults.md)
for how anime settings and account preferences affect the values shown in the
form.

## Sources and attribution

This guide is maintained for SeerrNG by snapetech and SeerrNG contributors.
Inherited Seerr, Jellyseerr and Overseerr work retains its original credit; see
[NOTICE](https://github.com/snapetech-org/seerrng/blob/main/NOTICE.md) and the
[upstream source ledger](https://github.com/snapetech-org/seerrng/blob/main/UPSTREAM_ATTRIBUTION.md).

Feature context and source credit (a report or proposal does not by itself prove
that upstream or a released SeerrNG version implements the behavior):

- [Upstream Seerr PR #2164](https://github.com/seerr-team/seerr/pull/2164) — [@gauthier-th](https://github.com/gauthier-th).
- [Upstream Seerr PR #3428](https://github.com/seerr-team/seerr/pull/3428) — [@aussierk](https://github.com/aussierk).
- [Upstream Seerr issue #3439](https://github.com/seerr-team/seerr/issues/3439) — [@gravelfreeman](https://github.com/gravelfreeman).
- [Upstream Seerr PR #3477](https://github.com/seerr-team/seerr/pull/3477) — [@fallenbagel](https://github.com/fallenbagel).
- [Upstream Seerr PR #3539](https://github.com/seerr-team/seerr/pull/3539) — [@fallenbagel](https://github.com/fallenbagel).

[Back to the Seerr / SeerrNG feature comparison](../feature-comparison.md).
