---
"@better-auth/electron": patch
---

Fixed `onUserUpdated` firing again with the same user on every session refetch and reaching only the focused window. It now fires in every open window, only when the user changes.
