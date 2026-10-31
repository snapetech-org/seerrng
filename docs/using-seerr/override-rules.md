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
reviewed before submitting.
