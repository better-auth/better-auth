---
"better-auth": patch
---

IP wildcard trusted origins such as `exp://192.168.*.*:*` no longer match custom-scheme hosts with out-of-range or zero-padded octets like `192.168.999.999`.
