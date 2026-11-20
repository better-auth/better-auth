---
"@better-auth/oauth-provider": patch
---

`oauthProviderClient` now adds `oauth_query` to form-encoded bodies as a form field, including bodies whose content type carries a charset, and leaves JSON bodies that are not objects, such as arrays, as written. Previously, a form body sent from a page with a signed OAuth query was re-sent as JSON under a form content type, and an array body was turned into an object.
