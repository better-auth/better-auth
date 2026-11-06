---
"auth": patch
---

Fixed CLI commands hanging or exiting with code 0 at a prompt in CI or without a terminal. They now exit with code 2 and name the flag to pass instead, such as `--yes`.
