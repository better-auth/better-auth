import type { RouteConfig } from "@asteasolutions/zod-to-openapi";
import {
	extendZodWithOpenApi,
	OpenAPIRegistry,
	OpenApiGeneratorV3,
	OpenApiGeneratorV31,
} from "@asteasolutions/zod-to-openapi";
import type { AuthContext, BetterAuthOptions } from "@better-auth/core";
import type {
	DBFieldAttribute,
	DBFieldAttributeConfig,
	DBFieldType,
} from "@better-auth/core/db";
import type {
	OpenAPIObject,
	PathItemObject,
	SchemaObject,
} from "openapi3-ts/oas31";
import * as z from "zod";
import { getEndpoints } from "../../api";
import { getAuthTables } from "../../db";
import { PACKAGE_VERSION } from "../../version";

extendZodWithOpenApi(z);

export type Path = PathItemObject;

export type FieldSchema = {
	type: DBFieldType;
	default?:
		| (DBFieldAttributeConfig["defaultValue"] | "Generated at runtime")
		| undefined;
	readOnly?: boolean | undefined;
	format?: string;
};

export type OpenAPIModelSchema = {
	type: "object";
	properties: Record<string, FieldSchema>;
	required?: string[] | undefined;
};

export interface GeneratorOptions {
	/** OpenAPI spec version. Defaults to 3.1. */
	version?: "3.0" | "3.1";
}

const capitalize = (s: string): string =>
	s.charAt(0).toUpperCase() + s.slice(1);

function dbFieldToSchema(field: DBFieldAttribute): SchemaObject {
	const schema: SchemaObject = {
		type: field.type === "date" ? "string" : (field.type as never),
	};
	if (field.type === "date") schema.format = "date-time";
	if (field.defaultValue !== undefined) {
		schema.default =
			typeof field.defaultValue === "function"
				? "Generated at runtime"
				: field.defaultValue;
	}
	if (field.input === false) schema.readOnly = true;
	return schema;
}

function dbTableToSchema(table: {
	fields: Record<string, DBFieldAttribute | undefined>;
}): SchemaObject {
	const properties: Record<string, SchemaObject> = { id: { type: "string" } };
	const required: string[] = [];
	for (const [key, field] of Object.entries(table.fields)) {
		if (!field) continue;
		properties[key] = dbFieldToSchema(field);
		if (field.required && field.input !== false) required.push(key);
	}
	return {
		type: "object",
		properties,
		...(required.length > 0 ? { required } : {}),
	};
}

function toOpenApiPath(path: string): string {
	return path
		.split("/")
		.map((part) => (part.startsWith(":") ? `{${part.slice(1)}}` : part))
		.join("/");
}

function unwrapOptional(schema: z.ZodType): z.ZodType {
	return schema instanceof z.ZodOptional
		? (schema.unwrap() as z.ZodType)
		: schema;
}

/**
 * Rewrites legacy OAS 3.0 `nullable: true` into OAS 3.1 union types inside
 * hand-written metadata that still flows through the transitional fallback.
 *
 * Applied only to fallback values. Routes that declare Zod `response` schemas
 * bypass this path entirely; the generator emits correct 3.1 from Zod directly.
 */
function upgradeNullableInPlace(value: unknown): unknown {
	if (value === null || typeof value !== "object") return value;
	if (Array.isArray(value)) {
		for (const entry of value) upgradeNullableInPlace(entry);
		return value;
	}
	const record = value as Record<string, unknown>;
	if (record.nullable === true) {
		const existingType = record.type;
		if (Array.isArray(existingType)) {
			if (!existingType.includes("null")) existingType.push("null");
		} else if (typeof existingType === "string") {
			record.type = [existingType, "null"];
		} else {
			record.type = ["null"];
		}
		// biome-ignore lint/performance/noDelete: must remove `nullable` entirely; undefined assignment leaves the key visible to JSON serializers.
		delete record.nullable;
	} else if (record.nullable === false) {
		// biome-ignore lint/performance/noDelete: see above.
		delete record.nullable;
	}
	for (const key of Object.keys(record)) upgradeNullableInPlace(record[key]);
	return value;
}

const ERROR_BODY_SCHEMA: SchemaObject = {
	type: "object",
	properties: {
		message: { type: "string" },
		code: { type: "string" },
	},
	required: ["message"],
};

interface EndpointLike {
	path?: string;
	options: {
		method?: string | string[];
		body?: z.ZodType;
		query?: z.ZodType;
		params?: z.ZodType;
		response?: z.ZodType;
		errors?: readonly string[];
		metadata?: {
			SERVER_ONLY?: boolean;
			openapi?: {
				description?: string;
				summary?: string;
				tags?: string[];
				operationId?: string;
				security?: RouteConfig["security"];
				deprecated?: boolean;
				externalDocs?: RouteConfig["externalDocs"];
				// Legacy fallback fields; tolerated for now, prefer `response`.
				requestBody?: unknown;
				parameters?: unknown;
				responses?: Record<string, unknown>;
			};
		};
	};
}

function buildRouteConfig(
	endpoint: EndpointLike,
	method: string,
	defaultTag: string,
): RouteConfig | null {
	if (!endpoint.path) return null;
	const opts = endpoint.options;
	const openapi = opts.metadata?.openapi;
	const lowerMethod = method.toLowerCase() as RouteConfig["method"];

	const config: RouteConfig = {
		method: lowerMethod,
		path: toOpenApiPath(endpoint.path),
		tags: [defaultTag, ...(openapi?.tags ?? [])],
		...(openapi?.description ? { description: openapi.description } : {}),
		...(openapi?.summary ? { summary: openapi.summary } : {}),
		...(openapi?.operationId ? { operationId: openapi.operationId } : {}),
		...(openapi?.deprecated ? { deprecated: openapi.deprecated } : {}),
		...(openapi?.externalDocs ? { externalDocs: openapi.externalDocs } : {}),
		security: openapi?.security ?? [{ bearerAuth: [] }],
		request: {},
		responses: {},
	};

	if (
		opts.body &&
		(method === "POST" ||
			method === "PUT" ||
			method === "PATCH" ||
			method === "DELETE")
	) {
		config.request!.body = {
			content: {
				"application/json": {
					schema: opts.body,
				},
			},
		};
	} else if (
		openapi?.requestBody &&
		(method === "POST" || method === "PUT" || method === "PATCH")
	) {
		// TODO(open-api): remove this fallback once every plugin migrates its
		// `metadata.openapi.requestBody` blocks to Zod `body` schemas.
		const legacy = structuredClone(openapi.requestBody);
		upgradeNullableInPlace(legacy);
		config.request!.body = legacy as unknown as NonNullable<
			RouteConfig["request"]
		>["body"];
	}

	if (opts.query) {
		const unwrapped = unwrapOptional(opts.query);
		if (unwrapped instanceof z.ZodObject) {
			config.request!.query = unwrapped;
		}
	}

	if (opts.params instanceof z.ZodObject) {
		config.request!.params = opts.params;
	}

	if (opts.response) {
		config.responses[200] = {
			description: "Success",
			content: {
				"application/json": {
					schema: opts.response,
				},
			},
		};
	} else if (openapi?.responses?.["200"]) {
		// TODO(open-api): remove this fallback once every plugin migrates its
		// `metadata.openapi.responses` to Zod `response` schemas.
		const legacy = structuredClone(openapi.responses["200"]);
		upgradeNullableInPlace(legacy);
		config.responses[200] = legacy as RouteConfig["responses"][string];
	} else {
		config.responses[200] = { description: "Success" };
	}

	if (opts.errors && opts.errors.length > 0) {
		config.responses[400] = {
			description: "Bad Request. One of the declared error codes was thrown.",
			content: { "application/json": { schema: ERROR_BODY_SCHEMA } },
		};
	}

	if (openapi?.responses) {
		for (const [status, value] of Object.entries(openapi.responses)) {
			if (status === "200") continue;
			const legacy = structuredClone(value);
			upgradeNullableInPlace(legacy);
			config.responses[status] = legacy as RouteConfig["responses"][string];
		}
	}

	return config;
}

export async function generator(
	ctx: AuthContext,
	options: BetterAuthOptions,
	generatorOptions?: GeneratorOptions,
): Promise<OpenAPIObject> {
	const version = generatorOptions?.version ?? "3.1";
	const coreRegistry = new OpenAPIRegistry();

	coreRegistry.registerComponent("securitySchemes", "bearerAuth", {
		type: "http",
		scheme: "bearer",
		description: "Bearer token authentication",
	});
	coreRegistry.registerComponent("securitySchemes", "apiKeyCookie", {
		type: "apiKey",
		in: "cookie",
		name: "apiKeyCookie",
		description: "API Key authentication via cookie",
	});

	const tables = getAuthTables({
		...options,
		session: {
			...options.session,
			storeSessionInDatabase: true,
		},
	});
	for (const [key, table] of Object.entries(tables)) {
		coreRegistry.registerComponent(
			"schemas",
			capitalize(key),
			dbTableToSchema(table as { fields: Record<string, DBFieldAttribute> }),
		);
	}

	const baseEndpoints = getEndpoints(ctx, {
		...options,
		plugins: [],
	});

	for (const endpoint of Object.values(baseEndpoints.api) as EndpointLike[]) {
		if (!endpoint.path || ctx.options.disabledPaths?.includes(endpoint.path)) {
			continue;
		}
		if (endpoint.options.metadata?.SERVER_ONLY) continue;
		const methods = Array.isArray(endpoint.options.method)
			? endpoint.options.method
			: endpoint.options.method
				? [endpoint.options.method]
				: [];
		for (const method of methods) {
			if (method === "HEAD" || method === "*") continue;
			const config = buildRouteConfig(endpoint, method, "Default");
			if (config) coreRegistry.registerPath(config);
		}
	}

	const pluginDefinitions: (typeof coreRegistry.definitions)[] = [];
	for (const plugin of options.plugins ?? []) {
		if (plugin.id === "open-api") continue;
		const pluginTag = capitalize(plugin.id);
		const pluginRegistry = new OpenAPIRegistry();
		const pluginEndpoints = getEndpoints(ctx, {
			...options,
			plugins: [plugin],
		});
		for (const [key, endpoint] of Object.entries(pluginEndpoints.api)) {
			if (
				baseEndpoints.api[key as keyof typeof baseEndpoints.api] !== undefined
			) {
				continue;
			}
			const e = endpoint as EndpointLike;
			if (!e.path || ctx.options.disabledPaths?.includes(e.path)) continue;
			if (e.options.metadata?.SERVER_ONLY) continue;
			const methods = Array.isArray(e.options.method)
				? e.options.method
				: e.options.method
					? [e.options.method]
					: [];
			for (const method of methods) {
				if (method === "HEAD" || method === "*") continue;
				const config = buildRouteConfig(e, method, pluginTag);
				if (config) pluginRegistry.registerPath(config);
			}
		}
		pluginDefinitions.push(pluginRegistry.definitions);
	}

	const allDefinitions = [
		...coreRegistry.definitions,
		...pluginDefinitions.flat(),
	];
	const Generator =
		version === "3.0" ? OpenApiGeneratorV3 : OpenApiGeneratorV31;
	const doc = new Generator(allDefinitions).generateDocument({
		openapi: version === "3.0" ? "3.0.3" : "3.1.0",
		info: {
			title: "Better Auth",
			description: "API Reference for your Better Auth Instance",
			version: PACKAGE_VERSION,
		},
		servers: [{ url: ctx.baseURL }],
		security: [{ apiKeyCookie: [], bearerAuth: [] }],
		tags: [
			{
				name: "Default",
				description:
					"Default endpoints that are included with Better Auth by default. These endpoints are not part of any plugin.",
			},
		],
	});

	return doc as OpenAPIObject;
}
