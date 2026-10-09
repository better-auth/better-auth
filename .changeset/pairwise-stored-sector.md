---
"@better-auth/oauth-provider": minor
---

Pairwise clients with custom-scheme or loopback redirect URIs now each receive a `sub` of their own. Previously, unrelated clients with redirect URIs such as `com.example.app:/callback`, `myapp://callback`, or `http://localhost:8787/callback` could receive the same pairwise `sub`. HTTPS clients on the same host still share a `sub`.

This adds a `sectorIdentifier` column to the `oauthClient` table. Run `npx auth@latest migrate`, or `npx auth@latest generate` for your ORM, before upgrading. Existing clients keep their current `sub`; the new rule applies to clients created after the upgrade.
