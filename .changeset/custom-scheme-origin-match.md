---
"better-auth": patch
---

Wildcard trusted origins now match custom-scheme URLs by their parsed scheme, host, and path, and no longer match a URL with userinfo or one that cannot be parsed as an origin. A wildcard host made only of digits, dots, and wildcards, such as `192.168.*.*`, now matches only IPv4 addresses in that range.
