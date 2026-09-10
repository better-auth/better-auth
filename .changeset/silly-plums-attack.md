---
"better-auth": minor
---

Added optional email confirmation for organization deletion and a new `organization.transferOwnership` endpoint, and an opt-in `confirmationMode: "explicit"` for `user.deleteUser`, `user.changeEmail`, and the two new organization confirmations. In `"explicit"` mode, the emailed link previews the pending change instead of applying it, so a link opened automatically by a mail client or security scanner can't trigger it — a separate confirm call is required. All of this is opt-in and behaves exactly as before at runtime for anyone who doesn't configure it.

**Breaking change (types only):** `organization.delete`'s return type is now `Organization | { success: true; message: string }` to accommodate the pending-verification response, even for callers who never configure `organizationDeletion`. Code that used the result without narrowing (e.g. reading `.slug` directly) needs a type guard.
