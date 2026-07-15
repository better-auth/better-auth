---
"@better-auth/scim": patch
---

Drop the `scimType: "noTarget"` label from a PATCH `remove` rejection when a `path` is present. RFC 7644 §3.12 defines `noTarget` as the path not yielding an attribute to operate on - for a path that exists on the schema and has a value (e.g. `name.formatted`), that's inaccurate; the real reason is that removal isn't implemented for that path yet. `noTarget` is still returned for the path-less case, which is the one RFC 7644 §3.5.2.2 actually specifies it for.
