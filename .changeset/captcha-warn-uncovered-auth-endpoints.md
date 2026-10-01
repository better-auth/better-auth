---
"better-auth": patch
---

Warn at startup when the captcha plugin is using its default endpoints and another plugin has added an authentication endpoint those defaults leave unprotected, such as `/sign-in/username`. Previously this misconfiguration was silent and the endpoint accepted sign-in attempts with no captcha challenge. Set the captcha `endpoints` option to opt those routes in.
