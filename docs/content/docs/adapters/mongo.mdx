---
title: MongoDB Adapter
description: Integrate Better Auth with MongoDB.
---

MongoDB is a popular NoSQL database that is widely used for building scalable and flexible applications. It provides a flexible schema that allows for easy data modeling and querying.
Read more here: [MongoDB](https://www.mongodb.com/).

## Example Usage

Make sure you have MongoDB installed and configured.
Then, you can use the mongodb adapter.

```ts title="auth.ts"
import { betterAuth } from "better-auth";
import { MongoClient } from "mongodb";
import { mongodbAdapter } from "better-auth/adapters/mongodb";

const client = new MongoClient("mongodb://localhost:27017/database");
const db = client.db();

export const auth = betterAuth({
  database: mongodbAdapter(db, {
    // Optional: if you don't provide a client, database transactions won't be enabled.
    client
  }),
});
```

## Schema generation & migration

For MongoDB, we don't need to generate or migrate the schema.


## Joins (Experimental)

Database joins is useful when Better-Auth needs to fetch related data from multiple tables in a single query.
Endpoints like `/get-session`, `/get-full-organization` and many others benefit greatly from this feature,
seeing upwards of 2x to 3x performance improvements depending on database latency.

The MongoDB adapter supports joins out of the box since version `1.4.0`.
To enable this feature, you need to set the `experimental.joins` option to `true` in your auth configuration.

```ts title="auth.ts"
export const auth = betterAuth({
  experimental: { joins: true }
});
```
