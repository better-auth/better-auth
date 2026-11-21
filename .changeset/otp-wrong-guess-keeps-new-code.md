---
"better-auth": patch
---

A wrong email OTP or phone number code no longer writes the previous code back once a new code has been sent. Before, when a new code was sent while the wrong one was being checked, the previous code was written back after it with one more attempt, so the previous code kept working and the code that was just sent was refused. The wrong-code path now runs the same check as the write-back of a correct code: when a new code is stored, it answers `INVALID_OTP`, writes nothing back and counts no attempt against the new code. A new code stored between that check and the write-back can still lose, as on the correct-code path.
