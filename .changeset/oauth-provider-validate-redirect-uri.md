---
"@better-auth/oauth-provider": minor
---

OAuth Provider now accepts an optional `validateRedirectURI` hook that authorizes redirect targets which aren't in a client's registered list, for dynamic or ephemeral hosts such as per-branch preview deployments. It runs only as a last resort, after the built-in checks fail, and covers both the `redirect_uri` at `/oauth2/authorize` and the `post_logout_redirect_uri` at RP-Initiated Logout (distinguished by a `type` argument). A declined URI is rejected without redirecting to the untrusted target.
</content>
