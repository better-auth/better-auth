---
"better-auth": patch
---

`getTestInstance` with `testWith: "mysql"` no longer hangs. Each instance now gets its own MySQL database at `127.0.0.1:3306`, created and dropped through the `root` account from the repository's Docker Compose `mysql` service, so several instances can run in one test file.
