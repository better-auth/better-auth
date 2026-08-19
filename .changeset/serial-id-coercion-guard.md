---
"@better-auth/core": patch
---

Raise a clear error naming the model and field when a non-numeric value is used as an id under `generateId: "serial"`, instead of silently sending `NaN` to the database and surfacing an opaque driver validation error.
