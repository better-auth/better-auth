---
"@better-auth/oauth-provider": minor
---

Pairwise clients with authority-free private-use redirect URIs, such as `com.example.app:/callback`, or loopback redirect URIs, such as `http://localhost:8787/callback`, now each receive a `sub` of their own. Previously, unrelated clients of either kind could receive the same pairwise `sub`. HTTPS clients on the same host still share a `sub`.

This adds a `sectorIdentifier` column to the `oauthClient` table. Run `npx auth@latest migrate`, or `npx auth@latest generate` for your ORM, before upgrading. Existing clients keep their current `sub`; the new rule applies to clients created after the upgrade.
