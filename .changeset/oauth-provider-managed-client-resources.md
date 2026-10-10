---
"@better-auth/oauth-provider": patch
---

If you register OAuth clients from your server with `adminCreateOAuthClient`, you can now pass `resources` to link the new client to protected resources in the same call. Previously you created the client first and then called `adminLinkClientResource` for each resource. `resourcePrivileges` is called with the `link` action for each requested resource, and a missing or disabled resource rejects the registration with `invalid_target`. Dynamic client registration and `adminLinkClientResource` are unchanged.
