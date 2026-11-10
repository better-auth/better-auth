---
"better-auth": patch
"@better-auth/oauth-provider": patch
---

If you run Better Auth on Cloudflare Workers with a `genericOAuth` provider that sets `discoveryUrl`, or with the OAuth provider plugin and `resources` configured, requests no longer hang when startup discovery or resource seeding has not completed. This mostly affects an auth instance created at module scope, where discovery and seeding cannot run at startup and are retried on later requests. Before, if a request ended while its retry was still running, later requests that named that provider, or that looked up a resource, waited forever. Now each request makes its own attempt, and the provider or resources become available once one attempt succeeds.

On other runtimes, concurrent requests now each retry instead of waiting for one shared attempt. While the provider's discovery endpoint or your database is unreachable, you may see a few more discovery requests or resource lookups.
