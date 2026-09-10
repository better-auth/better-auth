---
"better-auth": minor
---

Added optional email confirmation for organization deletion and a new `organization.transferOwnership` endpoint, and an opt-in `confirmationMode: "explicit"` for `user.deleteUser`, `user.changeEmail`, and the two new organization confirmations. In `"explicit"` mode, the emailed link previews the pending change instead of applying it, so a link opened automatically by a mail client or security scanner can't trigger it — a separate confirm call is required. Everything is opt-in and backward compatible.
