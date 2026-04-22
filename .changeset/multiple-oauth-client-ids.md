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

Also exports `getPrimaryClientId` from `@better-auth/core/oauth2` for provider authors: it returns the first non-empty Client ID from the string or array form. All five providers now validate `clientId` + `clientSecret` at sign-in time and throw `CLIENT_ID_AND_SECRET_REQUIRED` for empty or missing values instead of silently producing a malformed authorization URL. Apple, Facebook, and Microsoft Entra previously had no such guard.
