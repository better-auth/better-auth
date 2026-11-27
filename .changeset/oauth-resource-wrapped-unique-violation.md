---
"@better-auth/oauth-provider": patch
---

Fix the resource admin endpoints returning a 500 with the Drizzle adapter when a resource or client-resource link already exists. Creating a duplicate resource now returns the 400 "already exists" error, and linking an already linked client returns `alreadyLinked: true`. Other database errors are no longer reported as "already exists" when the resource identifier or client ID contains words such as "duplicate" or "unique".
