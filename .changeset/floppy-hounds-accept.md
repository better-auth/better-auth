---
"better-auth": minor
---

Added confirmationUrl option to the magicLink plugin. When set, the URL sent to the user points to a custom confirmation page instead of the direct verification endpoint. This prevents corporate email security scanners from pre-fetching and consuming the single-use token before the user clicks it.
