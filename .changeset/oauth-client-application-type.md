---
"@better-auth/oauth-provider": minor
"@better-auth/cimd": minor
---

OAuth clients describe their profile with one field, `application_type`, instead of two overlapping ones. The non-standard `type` field is removed, and its `web` and `native` values move to `application_type`; `user-agent-based` has no replacement, since a browser app registers with `token_endpoint_auth_method: "none"`, which already marks it public.

This release is breaking. Registration requests and the client management APIs no longer accept `type`, and client responses no longer return it. Replace `type: "web"` with `application_type: "web"`, `type: "native"` with `application_type: "native"`, and drop `type: "user-agent-based"`. A `native` client is now always treated as public, so PKCE is required for it even when the client registered with `require_pkce: false`.

The client table gains an `applicationType` column and no longer uses `type`. Run a migration after upgrading with `npx auth migrate` or `npx auth generate`. Existing clients keep working; those that had set `type` are treated as if no application type was declared, which leaves their redirect URIs unconstrained.
