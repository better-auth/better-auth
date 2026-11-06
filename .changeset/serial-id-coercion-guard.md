---
"@better-auth/core": patch
---

Fixes id lookups for apps that set `advanced.database.generateId: "serial"`. Apps with any other id setting are unaffected.

- A request with an id that is not a number, such as `organizationId=abc`, now gets the endpoint's usual not-found response on every database. On PostgreSQL and Prisma it used to fail with a database error.
- Lookups for a record whose reference is unset, such as a device code that no user has claimed yet, now find it. They used to find nothing.
- Writing a non-numeric value into an id reference, or filtering on one with an operator other than equality or `in`, now throws an error that names the model and field. Before, an invalid value was sent to the database.
