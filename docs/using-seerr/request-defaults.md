---
title: Request Defaults and Overrides
description: Understand how movie and series requests use Servarr defaults, account preferences, anime settings, and override rules.
---

# Request Defaults and Overrides

The advanced request form can show values before you change anything. A value
shown in a dropdown is not automatically treated as a deliberate request
override. SeerrNG resolves the selected service and the request owner's
preferences when it creates the request, then applies any matching override
rules.

## Which defaults are used

The available values depend on the selected Radarr or Sonarr service and the
person the request is for:

- Sonarr's anime profile, language profile, root folder, and tags are used when
  SeerrNG has classified the series as anime.
- The request owner's preferred language can select matching quality and
  language profiles.
- The request owner's preferred root folder for that service is used when it
  is available.
- The selected service's configured profile, folder, and tags provide the
  remaining defaults.
- A matching override rule can fill a folder, profile, or tags that have not
  been changed by an advanced requester.

Account preferences that differ from the connected service's own settings are
kept with the request so the request uses the preference shown in the form.

## When a value becomes an override

If you leave an advanced field at its resolved default, SeerrNG resolves that
default on the server instead of treating the displayed value as a custom
choice. A matching rule can therefore supply its value when the request is
submitted. If you explicitly select a value, that choice is kept even when it
matches the value already shown in the form; a rule does not replace an
explicit selection.

Tags are compared as a set, so changing only their order does not create a
different request choice.

## Editing a request

When you edit a pending movie or series request, SeerrNG keeps saved choices
that you have not changed. To clear a saved folder, profile, language profile,
or tag override, select the connected service's configured default and save.
The saved request destination is updated with the options shown in the form,
so later duplicate checks use the edited destination.

Requests created by an older SeerrNG version are not rewritten in the
background. Their saved options are considered when you edit them.

For rule conditions and precedence, see [Configure override rules](./override-rules.md).

Related Seerr reports provide context for these behaviors: [PR #3477](https://github.com/seerr-team/seerr/pull/3477), [issue #3410](https://github.com/seerr-team/seerr/issues/3410), and [PR #3539](https://github.com/seerr-team/seerr/pull/3539). They describe upstream discussion and do not define SeerrNG's request-target storage.
