---
"better-auth": patch
---

The Have I Been Pwned plugin now checks submitted passwords against the breach database on more password-setting endpoints by default, including the email-OTP and phone-number reset-password routes and the admin create-user and set-user-password routes. A breached password can no longer be set through those routes when the plugin is enabled with its default paths.
