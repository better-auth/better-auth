---
"better-auth": patch
---

Sending a new email OTP now replaces the earlier code for that address instead of keeping it. Before, a code resent after a wrong guess, or in the same millisecond as another send, could be refused while the earlier code still worked.
