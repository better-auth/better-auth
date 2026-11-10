---
"@better-auth/sso": patch
---

fix(sso): apply the default SAML clock skew to samlify's assertion window check

The documented 5-minute `saml.clockSkew` default was only applied by the plugin's own timestamp step. samlify checked the assertion's `NotBefore` and `NotOnOrAfter` first with no tolerance unless `clockSkew` was set explicitly, so assertions that were up to five minutes past their validity window, or up to five minutes early, were rejected. The default now reaches samlify as well.
