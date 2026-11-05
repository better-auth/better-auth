---
"@better-auth/core": minor
"better-auth": minor
---

`SlackProfile` email and profile claims are now optional, and custom claims are `unknown`; update profile mappings accordingly. The built-in provider and Generic OAuth helper use POST for userinfo and reject Slack errors returned with HTTP 200.
