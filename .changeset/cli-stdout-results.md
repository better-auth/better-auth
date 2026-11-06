---
"auth": patch
---

Fixed CLI notices mixing into the output of `auth info` and `auth secret`. `auth info --json --copy` now prints valid JSON, and `auth secret` prints only the `BETTER_AUTH_SECRET` line on stdout.
