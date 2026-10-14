---
"@better-auth/core": patch
"@better-auth/mongo-adapter": patch
---

If you pass `client` to `mongodbAdapter` on a replica set, concurrent requests that write the same documents no longer fail with a 500. Before, MongoDB aborted all but one of them with a write conflict, so a SCIM directory that provisions several users at once returned 500 for most of them. The adapter now retries such a transaction, as MongoDB requires, for up to 120 seconds or until your `MongoClient`'s `timeoutMS`. Under contention a request can take longer instead of failing.

A retry runs the work again. `databaseHooks` `before` hooks can run more than once for one request, and `after` hooks still run once, after the commit. Work that the request does outside the database before it commits can also repeat on a retried request. For example, an email sign-up can send its verification email twice. Requests that succeed on the first attempt are unaffected, and so are other adapters.
