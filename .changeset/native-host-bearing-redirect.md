---
"@better-auth/core": patch
"@better-auth/oauth-provider": patch
"@better-auth/cimd": patch
---

Native OAuth clients and Client ID Metadata Documents can now use custom-scheme redirect URIs with a host and a path, such as Cursor's `cursor://anysphere.cursor-mcp/oauth/callback`. Previously, only the authority-free reverse-domain form, such as `com.example.app:/callback`, was accepted, and these registrations failed with `invalid_redirect_uri`.

Cursor also omits `application_type` when it registers, so the `web` default still rejects it. To accept Cursor, set the new `clientRegistrationDefaultApplicationType` option to `"infer"`. A dynamic registration that omits `application_type` then becomes `native` when any of its redirect URIs uses a custom scheme, and every redirect URI must pass the native rules. Setting `"native"` treats every registration that omits the field as `native`. The default remains `"web"`, and an `application_type` the client sends is never overridden.

Pairwise clients (`subject_type: "pairwise"`) cannot use these host-bearing custom-scheme redirect URIs. Web clients are unaffected: they still accept only `https` redirect URIs on non-loopback hosts.
