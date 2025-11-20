# Better Auth Plugin Development Guide

This guide provides a comprehensive reference for developing Better Auth plugins, following the patterns established by the organization and graph plugins.

## Table of Contents

1. [Plugin Structure](#plugin-structure)
2. [File Organization](#file-organization)
3. [Core Files](#core-files)
   - [schema.ts](#schematsts)
   - [types.ts](#typests)
   - [adapter.ts](#adapterts)
   - [Main Plugin File](#main-plugin-file)
   - [Route Files](#route-files)
4. [Type System](#type-system)
5. [Best Practices](#best-practices)
6. [Complete Example](#complete-example)

## Plugin Structure

A Better Auth plugin should follow this directory structure:

```
src/plugins/your-plugin/
├── index.ts              # Main exports
├── your-plugin.ts        # Main plugin function
├── schema.ts             # Database schema definitions and Zod schemas
├── types.ts              # TypeScript types and options
├── adapter.ts            # Database adapter wrapper
├── error-codes.ts        # Error code constants
├── routes/               # API endpoint routes
│   ├── crud-entity1.ts
│   ├── crud-entity2.ts
│   └── ...
└── schemas.ts            # (Optional) Shared Zod schemas
```

## File Organization

### index.ts

The main entry point that exports the plugin and types:

```typescript
export * from "./your-plugin";
export type * from "./schema";
export type * from "./types";
```

### your-plugin.ts

The main plugin file that defines the plugin function and schema:

```typescript
import type { BetterAuthPlugin } from "@better-auth/core";
import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";
import type {
	YourPluginSchema,
	InferEntity1,
	InferEntity2,
} from "./schema";
import type { YourPluginOptions } from "./types";
import { YOUR_PLUGIN_ERROR_CODES } from "./error-codes";
import { createEntity1Route, getEntity1Route } from "./routes/crud-entity1";
import { createEntity2Route } from "./routes/crud-entity2";

export type YourPluginEndpoints<O extends YourPluginOptions> = {
	createEntity1: ReturnType<typeof createEntity1Route<O>>;
	getEntity1: ReturnType<typeof getEntity1Route<O>>;
	createEntity2: ReturnType<typeof createEntity2Route<O>>;
};

export type YourPluginPlugin<O extends YourPluginOptions> = {
	id: "your-plugin";
	endpoints: YourPluginEndpoints<O>;
	schema: YourPluginSchema<O>;
	$Infer: {
		Entity1: InferEntity1<O>;
		Entity2: InferEntity2<O>;
	};
	$ERROR_CODES: typeof YOUR_PLUGIN_ERROR_CODES;
	options: O;
};

/**
 * Your Plugin for Better Auth. Description of what your plugin does.
 *
 * @example
 * ```ts
 * const auth = betterAuth({
 *  plugins: [
 *    yourPlugin({
 *      // options
 *    }),
 *  ],
 * });
 * ```
 */
export function yourPlugin<O extends YourPluginOptions>(
	options?: O | undefined,
): {
	id: "your-plugin";
	endpoints: YourPluginEndpoints<O>;
	schema: YourPluginSchema<O>;
	$Infer: {
		Entity1: InferEntity1<O>;
		Entity2: InferEntity2<O>;
	};
	$ERROR_CODES: typeof YOUR_PLUGIN_ERROR_CODES;
	options: O;
};
export function yourPlugin<O extends YourPluginOptions>(
	options?: O | undefined,
): any {
	const endpoints = {
		/**
		 * ### Endpoint
		 *
		 * POST `/your-plugin/entity1/create`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.createEntity1`
		 *
		 * **client:**
		 * `authClient.yourPlugin.createEntity1`
		 *
		 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/your-plugin#api-method-create-entity1)
		 */
		createEntity1: createEntity1Route(options as O),
		/**
		 * ### Endpoint
		 *
		 * GET `/your-plugin/entity1/get`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.getEntity1`
		 *
		 * **client:**
		 * `authClient.yourPlugin.getEntity1`
		 *
		 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/your-plugin#api-method-get-entity1)
		 */
		getEntity1: getEntity1Route(options as O),
		createEntity2: createEntity2Route(options as O),
	};

	const schema = {
		entity1: {
			modelName: options?.schema?.entity1?.modelName || "entity1",
			fields: {
				name: {
					type: "string",
					required: true,
					fieldName: options?.schema?.entity1?.fields?.name || "name",
				},
				description: {
					type: "string",
					required: false,
					fieldName:
						options?.schema?.entity1?.fields?.description || "description",
				},
				metadata: {
					type: "string",
					required: false,
					fieldName: options?.schema?.entity1?.fields?.metadata || "metadata",
				},
				createdAt: {
					type: "date",
					required: true,
					defaultValue: Date,
					fieldName: options?.schema?.entity1?.fields?.createdAt || "createdAt",
				},
				updatedAt: {
					type: "date",
					required: false,
					fieldName: options?.schema?.entity1?.fields?.updatedAt || "updatedAt",
				},
				...(options?.schema?.entity1?.additionalFields || {}),
			},
		},
		entity2: {
			modelName: options?.schema?.entity2?.modelName || "entity2",
			fields: {
				entity1Id: {
					type: "string",
					required: true,
					references: {
						model: "entity1",
						field: "id",
						onDelete: "cascade",
					},
					fieldName: options?.schema?.entity2?.fields?.entity1Id || "entity1Id",
				},
				value: {
					type: "string",
					required: true,
					fieldName: options?.schema?.entity2?.fields?.value || "value",
				},
				createdAt: {
					type: "date",
					required: true,
					defaultValue: Date,
					fieldName: options?.schema?.entity2?.fields?.createdAt || "createdAt",
				},
				...(options?.schema?.entity2?.additionalFields || {}),
			},
		},
	} satisfies BetterAuthPluginDBSchema;

	return {
		id: "your-plugin",
		endpoints,
		schema: schema as YourPluginSchema<O>,
		$Infer: {
			Entity1: {} as InferEntity1<O>,
			Entity2: {} as InferEntity2<O>,
		},
		$ERROR_CODES: YOUR_PLUGIN_ERROR_CODES,
		options: options as O,
	} satisfies BetterAuthPlugin;
}
```

## Core Files

### schema.ts

Defines the database schema structure, Zod schemas, and type inference:

```typescript
import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";
import type { Prettify } from "better-call";
import * as z from "zod";
import type { InferAdditionalFieldsFromPluginOptions } from "../../db";
import { generateId } from "../../utils";
import type { YourPluginOptions } from "./types";

// Default field interfaces
interface Entity1DefaultFields {
	name: {
		type: "string";
		required: true;
	};
	description: {
		type: "string";
		required: false;
	};
	metadata: {
		type: "string";
		required: false;
	};
	createdAt: {
		type: "date";
		required: true;
		defaultValue: Date;
	};
	updatedAt: {
		type: "date";
		required: false;
	};
}

interface Entity2DefaultFields {
	entity1Id: {
		type: "string";
		required: true;
		references: {
			model: "entity1";
			field: "id";
			onDelete: "cascade";
		};
	};
	value: {
		type: "string";
		required: true;
	};
	createdAt: {
		type: "date";
		required: true;
		defaultValue: Date;
	};
}

// Schema inference helper
type InferSchema<
	Schema extends BetterAuthPluginDBSchema,
	TableName extends string,
	DefaultFields,
> = {
	modelName: Schema[TableName] extends { modelName: infer M }
		? M extends string
			? M
			: string
		: string;
	fields: {
		[K in keyof DefaultFields]: DefaultFields[K];
	} & (Schema[TableName] extends { additionalFields: infer F } ? F : {});
};

// Main schema type
export type YourPluginSchema<O extends YourPluginOptions> = {
	entity1: InferSchema<
		O["schema"] extends BetterAuthPluginDBSchema ? O["schema"] : {},
		"entity1",
		Entity1DefaultFields
	>;
	entity2: InferSchema<
		O["schema"] extends BetterAuthPluginDBSchema ? O["schema"] : {},
		"entity2",
		Entity2DefaultFields
	>;
};

// Zod schemas for validation
export const entity1Schema = z.object({
	id: z.string().default(generateId),
	name: z.string().min(1),
	description: z.string().optional(),
	metadata: z
		.record(z.string(), z.unknown())
		.or(z.string().transform((v) => JSON.parse(v)))
		.nullish()
		.optional(),
	createdAt: z.date().default(() => new Date()),
	updatedAt: z.date().nullish().optional(),
});

export const entity2Schema = z.object({
	id: z.string().default(generateId),
	entity1Id: z.string(),
	value: z.string(),
	createdAt: z.date().default(() => new Date()),
});

// Type exports
export type Entity1 = z.infer<typeof entity1Schema>;
export type Entity2 = z.infer<typeof entity2Schema>;

export type Entity1Input = z.input<typeof entity1Schema>;
export type Entity2Input = z.input<typeof entity2Schema>;

// Infer types with additional fields support
export type InferEntity1<
	O extends YourPluginOptions,
	isClientSide extends boolean = true,
> = Prettify<
	Entity1 & InferAdditionalFieldsFromPluginOptions<"entity1", O, isClientSide>
>;

export type InferEntity2<
	O extends YourPluginOptions,
	isClientSide extends boolean = true,
> = Prettify<
	Entity2 & InferAdditionalFieldsFromPluginOptions<"entity2", O, isClientSide>
>;
```

### types.ts

Defines the plugin options and configuration:

```typescript
import type { DBFieldAttribute } from "@better-auth/core/db";

export interface YourPluginOptions {
	// Plugin-specific configuration
	enabled?: boolean;
	customSetting?: string;

	// Schema customization
	schema?: {
		entity1?: {
			modelName?: string;
			fields?: {
				name?: string;
				description?: string;
				metadata?: string;
				createdAt?: string;
				updatedAt?: string;
			};
			additionalFields?: {
				[key in string]: DBFieldAttribute;
			};
		};
		entity2?: {
			modelName?: string;
			fields?: {
				entity1Id?: string;
				value?: string;
				createdAt?: string;
			};
			additionalFields?: {
				[key in string]: DBFieldAttribute;
			};
		};
	};
}
```

### adapter.ts

Provides a wrapper around the database adapter with proper type annotations and transaction support:

```typescript
import type { AuthContext } from "@better-auth/core";
import { getCurrentAdapter } from "@better-auth/core/context";
import { BetterAuthError } from "@better-auth/core/error";
import parseJSON from "../../client/parser";
import type { InferAdditionalFieldsFromPluginOptions } from "../../db";
import type {
	InferEntity1,
	InferEntity2,
	Entity1Input,
	Entity2Input,
} from "./schema";
import type { YourPluginOptions } from "./types";

export const getYourPluginAdapter = <O extends YourPluginOptions>(
	context: AuthContext,
	options?: O | undefined,
) => {
	const baseAdapter = context.adapter;
	return {
		// Entity1 operations
		findEntity1ById: async (entity1Id: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const entity1 = await adapter.findOne<InferEntity1<O, false>>({
				model: "entity1",
				where: [
					{
						field: "id",
						value: entity1Id,
					},
				],
			});
			if (!entity1) {
				return null;
			}
			return {
				...entity1,
				metadata:
					entity1.metadata && typeof entity1.metadata === "string"
						? parseJSON<Record<string, any>>(entity1.metadata)
						: entity1.metadata,
			} as typeof entity1;
		},
		createEntity1: async (
			data: Omit<Entity1Input, "id"> &
				Record<string, any> & {
					metadata?: Record<string, any> | undefined;
				},
		) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const entity1 = await adapter.create<
				typeof data,
				InferEntity1<O, false>
			>({
				model: "entity1",
				data: {
					...data,
					metadata: data.metadata ? JSON.stringify(data.metadata) : undefined,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});
			return {
				...entity1,
				metadata:
					entity1.metadata && typeof entity1.metadata === "string"
						? parseJSON<Record<string, any>>(entity1.metadata)
						: entity1.metadata,
			} as typeof entity1;
		},
		updateEntity1: async (
			entity1Id: string,
			data: Partial<Entity1Input> & {
				metadata?: Record<string, any> | undefined;
			},
		) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const entity1 = await adapter.update<InferEntity1<O, false>>({
				model: "entity1",
				where: [
					{
						field: "id",
						value: entity1Id,
					},
				],
				update: {
					...data,
					metadata:
						typeof data.metadata === "object"
							? JSON.stringify(data.metadata)
							: data.metadata,
					updatedAt: new Date(),
				},
			});
			if (!entity1) {
				return null;
			}
			return {
				...entity1,
				metadata:
					entity1.metadata && typeof entity1.metadata === "string"
						? parseJSON<Record<string, any>>(entity1.metadata)
						: entity1.metadata,
			};
		},
		deleteEntity1: async (entity1Id: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			await adapter.delete<InferEntity1<O, false>>({
				model: "entity1",
				where: [
					{
						field: "id",
						value: entity1Id,
					},
				],
			});
			return entity1Id;
		},
		listEntity1s: async (data: {
			limit?: number | undefined;
			offset?: number | undefined;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const [entity1s, total] = await Promise.all([
				adapter.findMany<InferEntity1<O, false>>({
					model: "entity1",
					limit: data.limit || 100,
					offset: data.offset || 0,
					sortBy: {
						field: "createdAt",
						direction: "desc",
					},
				}),
				adapter.count({
					model: "entity1",
				}),
			]);

			return {
				entity1s: entity1s.map((entity1) => ({
					...entity1,
					metadata:
						entity1.metadata && typeof entity1.metadata === "string"
							? parseJSON<Record<string, any>>(entity1.metadata)
							: entity1.metadata,
				})),
				total,
			};
		},

		// Entity2 operations
		createEntity2: async (
			data: Omit<Entity2Input, "id"> & Record<string, any>,
		) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const entity2 = await adapter.create<
				typeof data,
				InferEntity2<O, false>
			>({
				model: "entity2",
				data: {
					...data,
					createdAt: new Date(),
				},
			});
			return entity2;
		},
		findEntity2ById: async (entity2Id: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const entity2 = await adapter.findOne<InferEntity2<O, false>>({
				model: "entity2",
				where: [
					{
						field: "id",
						value: entity2Id,
					},
				],
			});
			return entity2;
		},
	};
};
```

### error-codes.ts

Defines error code constants:

```typescript
export const YOUR_PLUGIN_ERROR_CODES = {
	UNAUTHORIZED: "UNAUTHORIZED",
	ENTITY1_NOT_FOUND: "ENTITY1_NOT_FOUND",
	ENTITY2_NOT_FOUND: "ENTITY2_NOT_FOUND",
	INVALID_INPUT: "INVALID_INPUT",
} as const;
```

### Route Files (routes/crud-entity1.ts)

Defines API endpoints with proper validation and type inference:

```typescript
import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "better-call";
import * as z from "zod";
import { getSessionFromCtx, sessionMiddleware } from "../../../api";
import type { InferAdditionalFieldsFromPluginOptions } from "../../../db";
import { toZodSchema } from "../../../db/to-zod";
import { getYourPluginAdapter } from "../adapter";
import { YOUR_PLUGIN_ERROR_CODES } from "../error-codes";
import type { YourPluginOptions } from "../types";

export const createEntity1Route = <O extends YourPluginOptions>(
	options?: O | undefined,
) => {
	const additionalFieldsSchema = toZodSchema({
		fields: options?.schema?.entity1?.additionalFields || {},
		isClientSide: true,
	});
	const baseSchema = z.object({
		name: z.string().min(1).meta({
			description: "The name of the entity",
		}),
		description: z
			.string()
			.meta({
				description: "The description of the entity",
			})
			.optional(),
		metadata: z
			.record(z.string(), z.any())
			.meta({
				description: "Additional metadata",
			})
			.optional(),
	});

	type Body = InferAdditionalFieldsFromPluginOptions<"entity1", O> &
		z.infer<typeof baseSchema>;

	return createAuthEndpoint(
		"/your-plugin/entity1/create",
		{
			method: "POST",
			body: z.object({
				...baseSchema.shape,
				...additionalFieldsSchema.shape,
			}),
			use: [sessionMiddleware],
			metadata: {
				$Infer: {
					body: {} as Body,
				},
				openapi: {
					description: "Create a new entity1",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											entity1: {
												type: "object",
												description: "The created entity1",
											},
											success: {
												type: "boolean",
											},
										},
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session?.user) {
				throw new APIError("UNAUTHORIZED", {
					message: YOUR_PLUGIN_ERROR_CODES.UNAUTHORIZED,
				});
			}

			const adapter = getYourPluginAdapter(ctx.context, options as O);
			const entity1 = await adapter.createEntity1({
				name: ctx.body.name,
				description: ctx.body.description,
				metadata: ctx.body.metadata,
			});

			return ctx.json({ entity1, success: true });
		},
	);
};

export const getEntity1Route = <O extends YourPluginOptions>(
	options?: O | undefined,
) => {
	const querySchema = z.object({
		id: z
			.string()
			.meta({
				description: "The ID of the entity1",
			})
			.optional(),
	});

	return createAuthEndpoint(
		"/your-plugin/entity1/get",
		{
			method: "GET",
			query: querySchema,
			use: [sessionMiddleware],
			metadata: {
				openapi: {
					description: "Get an entity1 by ID",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											entity1: {
												type: "object",
												description: "The entity1",
											},
										},
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session?.user) {
				throw new APIError("UNAUTHORIZED", {
					message: YOUR_PLUGIN_ERROR_CODES.UNAUTHORIZED,
				});
			}

			if (!ctx.query.id) {
				throw new APIError("BAD_REQUEST", {
					message: YOUR_PLUGIN_ERROR_CODES.INVALID_INPUT,
				});
			}

			const adapter = getYourPluginAdapter(ctx.context, options as O);
			const entity1 = await adapter.findEntity1ById(ctx.query.id);

			if (!entity1) {
				throw new APIError("NOT_FOUND", {
					message: YOUR_PLUGIN_ERROR_CODES.ENTITY1_NOT_FOUND,
				});
			}

			return ctx.json({ entity1 });
		},
	);
};
```

## Type System

### Key Type Patterns

1. **Schema Inference**: Use `InferSchema` to infer schema types from options
2. **Additional Fields**: Use `InferAdditionalFieldsFromPluginOptions` to support custom fields
3. **Client/Server Types**: Use the `isClientSide` parameter to differentiate between client and server types
4. **Prettify**: Use `Prettify` to make complex types more readable

### Type Annotations in Adapter

Always use proper type annotations when calling adapter methods:

```typescript
// For findOne
const entity = await adapter.findOne<InferEntity1<O, false>>({
	model: "entity1",
	where: [{ field: "id", value: id }],
});

// For findMany
const entities = await adapter.findMany<InferEntity1<O, false>>({
	model: "entity1",
	where: [...],
	limit: 100,
	offset: 0,
	sortBy: {
		field: "createdAt",
		direction: "desc",
	},
});

// For create
const entity = await adapter.create<
	typeof data,
	InferEntity1<O, false>
>({
	model: "entity1",
	data: { ... },
});

// For update
const entity = await adapter.update<InferEntity1<O, false>>({
	model: "entity1",
	where: [{ field: "id", value: id }],
	update: { ... },
});

// For delete
await adapter.delete<InferEntity1<O, false>>({
	model: "entity1",
	where: [{ field: "id", value: id }],
});
```

## Best Practices

### 1. Use `getCurrentAdapter` for Transaction Support

Always use `getCurrentAdapter` in your adapter functions to ensure transaction support:

```typescript
const adapter = await getCurrentAdapter(baseAdapter);
```

### 2. Handle JSON Fields Properly

For fields that store JSON (like `metadata`), always stringify when saving and parse when reading:

```typescript
// When saving
metadata: data.metadata ? JSON.stringify(data.metadata) : undefined,

// When reading
metadata:
	entity.metadata && typeof entity.metadata === "string"
		? parseJSON<Record<string, any>>(entity.metadata)
		: entity.metadata,
```

### 3. Use `toZodSchema` for Additional Fields

When creating route schemas, use `toZodSchema` to include additional fields:

```typescript
const additionalFieldsSchema = toZodSchema({
	fields: options?.schema?.entity1?.additionalFields || {},
	isClientSide: true,
});

const bodySchema = z.object({
	...baseSchema.shape,
	...additionalFieldsSchema.shape,
});
```

### 4. Always Use Type Annotations

Always provide type annotations for adapter operations to ensure type safety:

```typescript
const entity = await adapter.findOne<InferEntity1<O, false>>({ ... });
```

### 5. Use `sessionMiddleware` for Protected Routes

Always use `sessionMiddleware` for routes that require authentication:

```typescript
use: [sessionMiddleware],
```

### 6. Provide OpenAPI Metadata

Include OpenAPI metadata for all endpoints to enable API documentation:

```typescript
metadata: {
	openapi: {
		description: "Create a new entity1",
		responses: {
			"200": {
				description: "Success",
				content: {
					"application/json": {
						schema: { ... },
					},
				},
			},
		},
	},
},
```

### 7. Use Descriptive Error Codes

Define clear error codes in `error-codes.ts` and use them consistently:

```typescript
throw new APIError("NOT_FOUND", {
	message: YOUR_PLUGIN_ERROR_CODES.ENTITY1_NOT_FOUND,
});
```

### 8. Support Field Name Customization

Allow users to customize field names in the schema:

```typescript
fieldName: options?.schema?.entity1?.fields?.name || "name",
```

### 9. Use `satisfies` for Type Safety

Use `satisfies` to ensure type safety while maintaining inference:

```typescript
} satisfies BetterAuthPluginDBSchema;
```

### 10. Document Endpoints with JSDoc

Add JSDoc comments to endpoints in the main plugin file:

```typescript
/**
 * ### Endpoint
 *
 * POST `/your-plugin/entity1/create`
 *
 * ### API Methods
 *
 * **server:**
 * `auth.api.createEntity1`
 *
 * **client:**
 * `authClient.yourPlugin.createEntity1`
 *
 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/your-plugin#api-method-create-entity1)
 */
createEntity1: createEntity1Route(options as O),
```

## Complete Example

For a complete working example, refer to:
- **Organization Plugin**: `packages/better-auth/src/plugins/organization/`
- **Graph Plugin**: `packages/better-auth/src/plugins/graph/`

These plugins follow all the patterns described in this guide and serve as reference implementations.

## Checklist

When creating a new plugin, ensure you have:

- [ ] Created `schema.ts` with proper type inference
- [ ] Created `types.ts` with plugin options
- [ ] Created `adapter.ts` with all CRUD operations
- [ ] Created `error-codes.ts` with error constants
- [ ] Created main plugin file with schema and endpoints
- [ ] Created route files for each entity
- [ ] Used `getCurrentAdapter` for transaction support
- [ ] Added proper type annotations to all adapter calls
- [ ] Handled JSON fields (stringify/parse)
- [ ] Used `toZodSchema` for additional fields
- [ ] Added OpenAPI metadata to all endpoints
- [ ] Used `sessionMiddleware` for protected routes
- [ ] Added JSDoc comments to endpoints
- [ ] Exported all types from `index.ts`
- [ ] Tested all endpoints

## Additional Resources

- Better Auth Core Types: `packages/core/src/`
- Database Adapter Interface: `packages/core/src/db/adapter/`
- Context and Transactions: `packages/core/src/context/`


