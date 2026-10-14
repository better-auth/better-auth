---
"@better-auth/mongo-adapter": patch
---

When you pass `client` to `mongodbAdapter`, a transaction whose commit fails before it reaches the server, for example because the commit timed out, is now aborted on the server. Before, the transaction stayed open until MongoDB's `transactionLifetimeLimitSeconds` expired (60 seconds by default), and other writes to the same documents waited or failed with write conflicts. The original commit error is still the one your code receives.
