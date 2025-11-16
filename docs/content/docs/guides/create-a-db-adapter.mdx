---
title: Create a Database Adapter
description: Learn how to create a custom database adapter for Better-Auth
---

Learn how to create a custom database adapter for Better-Auth using `createAdapterFactory`.

Our `createAdapterFactory` function is designed to be very flexible, and we've done our best to make it easy to understand and use.
Our hope is to allow you to focus on writing database logic, and not have to worry about how the adapter is working with Better-Auth.

Anything from custom schema configurations, custom ID generation, safe JSON parsing, key mapping, joins, and more is handled by the `createAdapterFactory` function.
All you need to do is provide the database logic, and the `createAdapterFactory` function will handle the rest.

## Quick Start

<Steps>
<Step>
### Get things ready

1. Import `createAdapterFactory`.
2. Create `CustomAdapterConfig` interface that represents your adapter config options.
3. Create the adapter!

```ts
import { createAdapterFactory, type DBAdapterDebugLogOption } from "better-auth/adapters";

// Your custom adapter config options
interface CustomAdapterConfig {
  /**
   * Helps you debug issues with the adapter.
   */
  debugLogs?: DBAdapterDebugLogOption;
  /**
   * If the table names in the schema are plural.
   */
  usePlural?: boolean;
}

export const myAdapter = (config: CustomAdapterConfig = {}) =>
  createAdapterFactory({
    // ...
  });
```

</Step>

<Step>
### Configure the adapter

The `config` object is mostly used to provide information about the adapter to Better-Auth.
We try to minimize the amount of code you need to write in your adapter functions, and these `config` options are used to help us do that.

```ts
// ...
export const myAdapter = (config: CustomAdapterConfig = {}) =>
  createAdapterFactory({
    config: {
      adapterId: "custom-adapter", // A unique identifier for the adapter.
      adapterName: "Custom Adapter", // The name of the adapter.
      usePlural: config.usePlural ?? false, // Whether the table names in the schema are plural.
      debugLogs: config.debugLogs ?? false, // Whether to enable debug logs.
      supportsJSON: false, // Whether the database supports JSON. (Default: false)
      supportsDates: true, // Whether the database supports dates. (Default: true)
      supportsBooleans: true, // Whether the database supports booleans. (Default: true)
      supportsNumericIds: true, // Whether the database supports auto-incrementing numeric IDs. (Default: true)
    },
    // ...
  });
```
</Step>

<Step>
### Create the adapter

The `adapter` function is where you write the code that interacts with your database.

```ts
// ...
export const myAdapter = (config: CustomAdapterConfig = {}) =>
  createAdapterFactory({
    config: {
      // ...
    },
    adapter: ({}) => {
      return {
        create: async ({ data, model, select }) => {
          // ...
        },
        update: async ({ data, model, select }) => {
          // ...
        },
        updateMany: async ({ data, model, select }) => {
          // ...
        },
        delete: async ({ data, model, select }) => {
          // ...
        },
        // ...
      };
    },
  });
```

<Callout>
Learn more about the `adapter` here [here](/docs/concepts/database#adapters).
</Callout>
</Step>

</Steps>

## Adapter

The `adapter` function is where you write the code that interacts with your database.

If you haven't already, check out the `options` object in the [config section](#config), as it can be useful for your adapter.

Before we get into the adapter function, let's go over the parameters that are available to you.

- `options`: The Better Auth options.
- `schema`: The schema from the user's Better Auth instance.
- `debugLog`: The debug log function.
- `getFieldName`: Function to get the transformed field name for the database.
- `getModelName`: Function to get the transformed model name for the database.
- `getDefaultModelName`: Function to get the default model name from the schema.
- `getDefaultFieldName`: Function to get the default field name from the schema.
- `getFieldAttributes`: Function to get field attributes for a specific model and field.
- `transformInput`: Function to transform input data before saving to the database.
- `transformOutput`: Function to transform output data after retrieving from the database.
- `transformWhereClause`: Function to transform where clauses for database queries.

```ts title="Example"
adapter: ({
  options,
  schema,
  debugLog,
  getFieldName,
  getModelName,
  getDefaultModelName,
  getDefaultFieldName,
  getFieldAttributes,
  transformInput,
  transformOutput,
  transformWhereClause,
}) => {
  return {
    // ...
  };
};
```

### Adapter Methods

- All `model` values are already transformed into the correct model name for the database based on the end-user's schema configuration.
  - This also means that if you need access to the `schema` version of a given model, you can't use this exact `model` value, you'll need to use the `getDefaultModelName` function provided in the options to convert the `model` to the `schema` version.
- We will automatically fill in any missing fields you return based on the user's `schema` configuration.
- Any method that includes a `select` parameter, is only for the purpose of getting data from your database more efficiently. You do not need to worry about only returning what the `select` parameter states, as we will handle that for you.

### `create` method

The `create` method is used to create a new record in the database.

<Callout>
It's possible to pass `forceAllowId` as a parameter to the `create` method, which allows `id` to be provided in the `data` object.
We handle `forceAllowId` internally, so you don't need to worry about it.
</Callout>

parameters:

- `model`: The model/table name that new data will be inserted into.
- `data`: The data to insert into the database.
- `select`: An array of fields to return from the database.

<Callout>
  Make sure to return the data that is inserted into the database.
</Callout>

```ts title="Example"
create: async ({ model, data, select }) => {
  // Example of inserting data into the database.
  return await db.insert(model).values(data);
};
```

### `update` method

The `update` method is used to update a record in the database.

parameters:

- `model`: The model/table name that the record will be updated in.
- `where`: The `where` clause to update the record by.
- `update`: The data to update the record with.

<Callout>
  Make sure to return the data in the row which is updated. This includes any
  fields that were not updated.
</Callout>

```ts title="Example"
update: async ({ model, where, update }) => {
  // Example of updating data in the database.
  return await db.update(model).set(update).where(where);
};
```

### `updateMany` method

The `updateMany` method is used to update multiple records in the database.

parameters:

- `model`: The model/table name that the records will be updated in.
- `where`: The `where` clause to update the records by.
- `update`: The data to update the records with.

<Callout>Make sure to return the number of records that were updated.</Callout>

```ts title="Example"
updateMany: async ({ model, where, update }) => {
  // Example of updating multiple records in the database.
  return await db.update(model).set(update).where(where);
};
```

### `delete` method

The `delete` method is used to delete a record from the database.

parameters:

- `model`: The model/table name that the record will be deleted from.
- `where`: The `where` clause to delete the record by.

```ts title="Example"
delete: async ({ model, where }) => {
  // Example of deleting a record from the database.
  await db.delete(model).where(where);
}
```

### `deleteMany` method

The `deleteMany` method is used to delete multiple records from the database.

parameters:

- `model`: The model/table name that the records will be deleted from.
- `where`: The `where` clause to delete the records by.

<Callout>Make sure to return the number of records that were deleted.</Callout>

```ts title="Example"
deleteMany: async ({ model, where }) => {
  // Example of deleting multiple records from the database.
  return await db.delete(model).where(where);
};
```

### `findOne` method

The `findOne` method is used to find a single record in the database.

parameters:

- `model`: The model/table name that the record will be found in.
- `where`: The `where` clause to find the record by.
- `select`: The `select` clause to return.
- `join`: Optional join configuration to fetch related records in a single query.

<Callout>Make sure to return the data that is found in the database.</Callout>

```ts title="Example"
findOne: async ({ model, where, select, join }) => {
  // Example of finding a single record in the database.
  return await db.select().from(model).where(where).limit(1);
};
```

### `findMany` method

The `findMany` method is used to find multiple records in the database.

parameters:

- `model`: The model/table name that the records will be found in.
- `where`: The `where` clause to find the records by.
- `limit`: The limit of records to return.
- `sortBy`: The `sortBy` clause to sort the records by.
- `offset`: The offset of records to return.
- `join`: Optional join configuration to fetch related records in a single query.

<Callout>
  Make sure to return the array of data that is found in the database.
</Callout>

```ts title="Example"
findMany: async ({ model, where, limit, sortBy, offset, join }) => {
  // Example of finding multiple records in the database.
  return await db
    .select()
    .from(model)
    .where(where)
    .limit(limit)
    .offset(offset)
    .orderBy(sortBy);
};
```

### `count` method

The `count` method is used to count the number of records in the database.

parameters:

- `model`: The model/table name that the records will be counted in.
- `where`: The `where` clause to count the records by.

<Callout>Make sure to return the number of records that were counted.</Callout>

```ts title="Example"
count: async ({ model, where }) => {
  // Example of counting the number of records in the database.
  return await db.select().from(model).where(where).count();
};
```

### `options` (optional)

The `options` object is for any potential config that you got from your custom adapter options.

```ts title="Example"
const myAdapter = (config: CustomAdapterConfig) =>
  createAdapterFactory({
    config: {
      // ...
    },
    adapter: ({ options }) => {
      return {
        options: config,
      };
    },
  });
```

### `createSchema` (optional)

The `createSchema` method allows the [Better Auth CLI](/docs/concepts/cli) to [generate](/docs/concepts/cli/#generate) a schema for the database.

parameters:

- `tables`: The tables from the user's Better-Auth instance schema; which is expected to be generated into the schema file.
- `file`: The file the user may have passed in to the `generate` command as the expected schema file output path.

```ts title="Example"
createSchema: async ({ file, tables }) => {
  // ... Custom logic to create a schema for the database.
};
```

## Test your adapter

We've provided a test suite that you can use to test your adapter. It requires you to use `vitest`.

```ts title="my-adapter.test.ts"
import { expect, test, describe } from "vitest";
import { runAdapterTest } from "better-auth/adapters/test";
import { myAdapter } from "./my-adapter";

describe("My Adapter Tests", async () => {
  afterAll(async () => {
    // Run DB cleanup here...
  });
  const adapter = myAdapter({
    debugLogs: {
      // If your adapter config allows passing in debug logs, then pass this here.
      isRunningAdapterTests: true, // This is our super secret flag to let us know to only log debug logs if a test fails.
    },
  });

  runAdapterTest({
    getAdapter: async (betterAuthOptions = {}) => {
      return adapter(betterAuthOptions);
    },
  });
});
```

### Numeric ID tests

If your database supports numeric IDs, then you should run this test as well:

```ts title="my-adapter.number-id.test.ts"
import { expect, test, describe } from "vitest";
import { runNumberIdAdapterTest } from "better-auth/adapters/test";
import { myAdapter } from "./my-adapter";

describe("My Adapter Numeric ID Tests", async () => {
  afterAll(async () => {
    // Run DB cleanup here...
  });
  const adapter = myAdapter({
    debugLogs: {
      // If your adapter config allows passing in debug logs, then pass this here.
      isRunningAdapterTests: true, // This is our super secret flag to let us know to only log debug logs if a test fails.
    },
  });

  runNumberIdAdapterTest({
    getAdapter: async (betterAuthOptions = {}) => {
      return adapter(betterAuthOptions);
    },
  });
});
```

## Config

The `config` object is used to provide information about the adapter to Better-Auth.

We **highly recommend** going through and reading each provided option below, as it will help you understand how to properly configure your adapter.

### Required Config

### `adapterId`

A unique identifier for the adapter.

### `adapterName`

The name of the adapter.

### Optional Config

### `supportsNumericIds`

Whether the database supports numeric IDs. If this is set to `false` and the user's config has enabled `useNumberId`, then we will throw an error.

### `supportsJSON`

Whether the database supports JSON. If the database doesn't support JSON, we will use a `string` to save the JSON data.And when we retrieve the data, we will safely parse the `string` back into a JSON object.

### `supportsDates`

Whether the database supports dates. If the database doesn't support dates, we will use a `string` to save the date. (ISO string) When we retrieve the data, we will safely parse the `string` back into a `Date` object.

### `supportsBooleans`

Whether the database supports booleans. If the database doesn't support booleans, we will use a `0` or `1` to save the boolean value. When we retrieve the data, we will safely parse the `0` or `1` back into a boolean value.

### `usePlural`

Whether the table names in the schema are plural. This is often defined by the user, and passed down through your custom adapter options. If you do not intend to allow the user to customize the table names, you can ignore this option, or set this to `false`.

```ts title="Example"
const adapter = myAdapter({
  // This value then gets passed into the `usePlural`
  // option in the createAdapterFactory `config` object.
  usePlural: true,
});
```

### `transaction`

Whether the adapter supports transactions. If `false`, operations run sequentially; otherwise provide a function that executes a callback with a `TransactionAdapter`.

<Callout type="warn">
  If your database does not support transactions, the error handling and rollback
  will not be as robust. We recommend using a database that supports transactions
  for better data integrity.
</Callout>

### `debugLogs`

Used to enable debug logs for the adapter. You can pass in a boolean, or an object with the following keys: `create`, `update`, `updateMany`, `findOne`, `findMany`, `delete`, `deleteMany`, `count`.
If any of the keys are `true`, the debug logs will be enabled for that method.

```ts title="Example"
// Will log debug logs for all methods.
const adapter = myAdapter({
  debugLogs: true,
});
```

```ts title="Example"
// Will only log debug logs for the `create` and `update` methods.
const adapter = myAdapter({
  debugLogs: {
    create: true,
    update: true,
  },
});
```

### `disableIdGeneration`

Whether to disable ID generation. If this is set to `true`, then the user's `generateId` option will be ignored.

### `customIdGenerator`

If your database only supports a specific custom ID generation, then you can use this option to generate your own IDs.

### `mapKeysTransformInput`

If your database uses a different key name for a given situation, you can use this option to map the keys. This is useful for databases that expect a different key name for a given situation.
For example, MongoDB uses `_id` while in Better-Auth we use `id`.

Each key in the returned object represents the old key to replace.
The value represents the new key.

This can be a partial object that only transforms some keys.

```ts title="Example"
mapKeysTransformInput: {
  id: "_id", // We want to replace `id` to `_id` to save into MongoDB
},
```

### `mapKeysTransformOutput`

If your database uses a different key name for a given situation, you can use this option to map the keys. This is useful for databases that use a different key name for a given situation.
For example, MongoDB uses `_id` while in Better-Auth we use `id`.

Each key in the returned object represents the old key to replace.
The value represents the new key.

This can be a partial object that only transforms some keys.

```ts title="Example"
mapKeysTransformOutput: {
  _id: "id", // We want to replace `_id` (from MongoDB) to `id` (for Better-Auth)
},
```

### `customTransformInput`

If you need to transform the input data before it is saved to the database, you can use this option to transform the data.

<Callout type="warn">
  If you're using `supportsJSON`, `supportsDates`, or `supportsBooleans`, then
  the transformations will be applied before your `customTransformInput`
  function is called.
</Callout>
The `customTransformInput` function receives the following arguments:

- `data`: The data to transform.
- `field`: The field that is being transformed.
- `fieldAttributes`: The field attributes of the field that is being transformed.
- `action`: The action which was called from the adapter (`create` or `update`).
- `model`: The model that is being transformed.
- `schema`: The schema that is being transformed.
- `options`: Better Auth options.

The `customTransformInput` function runs at every key in the data object of a given action.

```ts title="Example"
customTransformInput: ({ field, data }) => {
  if (field === "id") {
    return "123"; // Force the ID to be "123"
  }

  return data;
};
```

### `customTransformOutput`

If you need to transform the output data before it is returned to the user, you can use this option to transform the data. The `customTransformOutput` function is used to transform the output data.
Similar to the `customTransformInput` function, it runs at every key in the data object of a given action, but it runs after the data is retrieved from the database.

```ts title="Example"
customTransformOutput: ({ field, data }) => {
  if (field === "name") {
    return "Bob"; // Force the name to be "Bob"
  }

  return data;
};
```

```ts
const some_data = await adapter.create({
  model: "user",
  data: {
    name: "John",
  },
});

// The name will be "Bob"
console.log(some_data.name);
```

### `disableTransformInput`

Whether to disable input transformation. This should only be used if you know what you're doing and are manually handling all transformations.

<Callout type="warn">
  Disabling input transformation can break important adapter functionality like ID generation, boolean/date/JSON conversion, and key mapping.
</Callout>

### `disableTransformOutput`

Whether to disable output transformation. This should only be used if you know what you're doing and are manually handling all transformations.

<Callout type="warn">
  Disabling output transformation can break important adapter functionality like boolean/date/JSON parsing and key mapping.
</Callout>

### `disableTransformJoin`

Whether to disable join transformation. This should only be used if you know what you're doing and are manually handling joins.

<Callout type="warn">
  Disabling join transformation can break join functionality.
</Callout>

### `supportsJoin`

Whether the adapter supports native joins. If set to `false` (the default), Better-Auth will handle joins by making multiple queries and combining the results. If set to `true`, the adapter is expected to handle joins natively (e.g., SQL JOIN operations).

```ts title="Example"
// For adapters that support native SQL joins
const adapter = myAdapter({
  supportsJoin: true,
});
```
 