---
"@better-auth/sso": patch
---

Honor `errorCallbackURL` for SAML account resolution failures such as `signup_disabled` and `account_not_linked`, instead of redirecting to the success callback with an error parameter.
