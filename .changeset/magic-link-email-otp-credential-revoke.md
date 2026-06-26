---
"better-auth": patch
---

Magic-link and email-OTP sign-in now reset the credentials on an account whose email had never been confirmed. When verification resolves to such an account, any existing password on it is removed and its sessions are revoked before the user is signed in, so proven control of the mailbox is the source of truth for the account.

If you signed up with email and password but first signed in through a magic link or email OTP rather than confirming the verification email, your password is cleared and you will need to set a new one through password reset.
