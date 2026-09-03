---
"@better-auth/cimd": patch
---

Fix `fetchClientMetadataResource`'s Node transport throwing `ERR_INVALID_IP_ADDRESS` for every request. `https.request`'s Happy Eyeballs connection path (`lookupAndConnectMultiple`) invokes the custom `lookup` option with `{ all: true }` and expects an array-style `(err, addresses[])` callback, but the pinned-address lookup always answered with the legacy `(err, address, family)` form, so every CIMD metadata fetch failed with a network error.
