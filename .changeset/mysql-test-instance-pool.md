---
"better-auth": patch
---

`getTestInstance` with `testWith: "mysql"` no longer hangs. It expects a MySQL server at `127.0.0.1:3306` whose `root` password is `root_password`, and it creates and drops a separate database for each instance, so several instances can run in one test file.
