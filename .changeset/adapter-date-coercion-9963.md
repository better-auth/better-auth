---
"@better-auth/core": patch
"@better-auth/drizzle-adapter": patch
---

Fix date fields coming back as `Invalid Date` when a driver returns them as a raw epoch-millisecond string or number (e.g. a Drizzle + libSQL text column). The adapter factory's `supportsDates: false` output transform and the Drizzle adapter's `customTransformOutput` now parse numeric-millisecond strings and raw numbers into `Date` in addition to ISO strings.
