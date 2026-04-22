---
"better-auth": patch
"@better-auth/core": patch
---

Accept an array of Client IDs on providers that verify ID tokens by audience (Google, Apple, Microsoft Entra, Facebook, Cognito). The first entry is used for the authorization code flow; all entries are accepted when verifying an ID token's `aud` claim, so a single backend can serve Web, iOS, and Android clients with their platform-specific Client IDs.

```ts
socialProviders: {
  google: {
    clientId: [
      process.env.GOOGLE_WEB_CLIENT_ID!,
      process.env.GOOGLE_IOS_CLIENT_ID!,
      process.env.GOOGLE_ANDROID_CLIENT_ID!,
    ],
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  },
}
```

Passing a single string keeps working; no migration needed.
