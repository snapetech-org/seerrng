# OpenAPI API contract alignment

The API specification now separates user update inputs from user responses and more accurately describes SeerrNG request, media, user, issue, and provider data. This keeps route validation aligned with accepted request fields and gives API clients clearer type and nullability information without documenting provider credentials.

Adapted from Seerr's [OpenAPI schema corrections](https://github.com/seerr-team/seerr/pull/2700) to match SeerrNG's routes and safe response projections.
