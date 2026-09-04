---
"@better-auth/mongo-adapter": patch
---

Recognize ObjectId and UUID values returned by a `mongodb` driver that loaded a different `bson` module instance, so ids are normalized to strings instead of failing `instanceof`.
