---
"@better-auth/core": patch
---

Fixes id handling for apps that set `advanced.database.generateId: "serial"`. Apps using any other id setting are unaffected.

- Looking up a record by an id that is not a number, such as a client sending `organizationId=abc`, now finds nothing on every database, so the endpoint returns its usual not-found error. On PostgreSQL and Prisma these requests used to fail with a database error.
- Queries that match an unset reference, such as a device code that no user has claimed yet, now find that record. They previously found nothing.
- Writing a non-numeric value into an id reference, or comparing one with an operator other than equality or `in`, now throws an error that names the model and field, instead of sending `NaN` to the database.
