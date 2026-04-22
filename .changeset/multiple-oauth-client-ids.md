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

Also exports `getPrimaryClientId` from `@better-auth/core/oauth2` for provider authors: it returns the first non-empty Client ID from the string or array form. Providers now reject empty arrays, empty strings, and missing config at sign-in time instead of silently producing a malformed authorization URL. Google, Apple, and Facebook require both `clientId` and `clientSecret` (server-side code exchange is always a confidential-client flow). Microsoft Entra and Cognito only require `clientId`, since both support public-client flows (PKCE only, no secret).
