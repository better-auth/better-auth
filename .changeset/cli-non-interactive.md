---
"auth": patch
---

Fixed CLI commands hanging or exiting with code 0 at a prompt in CI or without a terminal. They now exit with code 2 and name what they need instead, such as `--yes`. Prompts now appear on stderr, so redirecting stdout no longer hides them.
