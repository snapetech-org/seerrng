# Maintaining the OpenAPI API Contract

SeerrNG loads [`seerr-api.yml`](../../seerr-api.yml) through
`express-openapi-validator` with request validation enabled. The specification
therefore controls which requests reach route handlers as well as documenting
the API. A schema that only resembles a response object can reject a valid
request before the handler sees it.

## Match each route to runtime behavior

For every changed path and method, compare the schema with both sides of the
route:

- **Request input:** inspect the route's body parser and validation helpers.
  Define a request schema for the fields callers may send. Do not reuse a full
  response entity when the accepted payload is narrower. For example,
  `PUT /user/{userId}` accepts a local username and permission bitmask, while
  its response is a filtered `User` object.
- **Response output:** trace the actual serializer and permission checks.
  `User.filter()` removes credentials, `User.publicFilter()` limits embedded
  identities, and `filterEntityResponse()` recursively applies those public
  projections. Media responses also remove operational identifiers that the
  caller cannot manage.
- **Field shape:** verify exact property names, types, enum values, nullability,
  optionality, and whether a value is an object or an array against the entity,
  interface, and mapping function that produce it.

Keep permission-dependent fields documented as optional and describe when they
are present. Do not add provider credentials, password-reset values, raw
download-client identifiers, or fields that the runtime projection removes.
Where an identifier is safely exposed only as an opaque alias, describe that
alias rather than the private source value.

## Keep related schemas in sync

When an entity or API type changes, search all of its route and schema uses.
Check list wrappers as well as item schemas so an array is not wrapped in a
second array. Keep request and response models separate when they have
different permissions or validation rules, and update nested service, season,
and provider shapes alongside their parent models.

For selected upstream changes, review the proposed behavior against SeerrNG's
own routes and filters instead of copying a schema wholesale. The API contract
updates in SeerrNG [PR #429](https://github.com/snapetech-org/seerrng/pull/429)
adapted relevant corrections from Seerr [PR #2700](https://github.com/seerr-team/seerr/pull/2700)
to the fork's current request and response fields.

## Review checklist

- Confirm the endpoint is implemented and the OpenAPI operation uses the same
  request and response shape as its route.
- Confirm local `$ref` values resolve and array/object wrappers match the
  runtime model.
- Confirm sensitive values are absent from response schemas and
  permission-dependent fields have clear presence conditions.
- Update the README or operator documentation when the contract changes how
  clients validate or interpret an endpoint.
- Add a release note for API changes visible to clients and record upstream
  provenance in the public PR description.
