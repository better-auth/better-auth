---
"better-auth": patch
---

Fixes API key remaining initialization issue #3640.
This is a one line change to fix the initialiation of the remaining variable
when creating a new API key. Setting remaining to null during the creation of a
key to signify 'no cap' on key usage should propagate to the database. The
current code is treating null as an invalid value and replacing it with the
value of remaining. Setting the value to remaining introduces a cap on API key
usage, which is incorrect behaviour.
