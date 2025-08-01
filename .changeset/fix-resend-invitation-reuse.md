---
"better-auth": patch
---

fix: resend invitation should reuse existing invitation instead of creating duplicate

- Modified inviteMember to reuse existing pending invitations when resend=true
- Added logic to return existing invitation instead of creating new one  
- Prevents duplicate invitation records in database when resending
- Fixes issue where resend was creating duplicates instead of being idempotent
