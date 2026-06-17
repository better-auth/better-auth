import type { AuthContext, BetterAuthOptions } from "@better-auth/core";
import type {
	DBFieldAttribute,
	DBFieldAttributeConfig,
	DBFieldType,
} from "@better-auth/core/db";
import type {
	OpenAPIParameter as BetterCallOpenAPIParameter,
	Endpoint,
	EndpointOptions,
	OpenAPISchemaType,
} from "better-call";
import * as z from "zod";
import { getEndpoints } from "../../api";
import { getAuthTables } from "../../db";

export interface Path {
	get?: OpenAPIOperation | undefined;
	post?: OpenAPIOperation | undefined;
	put?: OpenAPIOperation | undefined;
	patch?: OpenAPIOperation | undefined;
	delete?: OpenAPIOperation | undefined;
}

type OpenAPISchemaPrimitiveType = OpenAPISchemaType | "null";

export type OpenAPISchema = {
	type?: OpenAPISchemaPrimitiveType | OpenAPISchemaPrimitiveType[];
	properties?: Record<string, OpenAPISchema>;
	required?: string[];
	$ref?: string;
	description?: string;
	default?: unknown;
	readOnly?: boolean;
	format?: string;
	deprecated?: boolean;
	enum?: unknown[];
	items?: OpenAPISchema;
	minLength?: number;
	maxLength?: number;
	minimum?: number;
	maximum?: number;
	additionalProperties?: boolean | OpenAPISchema;
	propertyNames?: OpenAPISchema;
	allOf?: OpenAPISchema[];
	anyOf?: OpenAPISchema[];
	oneOf?: OpenAPISchema[];
	const?: unknown;
	example?: unknown;
};

export type OpenAPIParameter = Omit<BetterCallOpenAPIParameter, "schema"> & {
	schema?: OpenAPISchema;
};

type OpenAPIMediaTypeObject = {
	schema?: OpenAPISchema;
};

type OpenAPIResponseContent = {
	"application/json"?: OpenAPIMediaTypeObject;
	"text/plain"?: OpenAPIMediaTypeObject;
	"text/html"?: OpenAPIMediaTypeObject;
	[contentType: string]: OpenAPIMediaTypeObject | undefined;
};

type OpenAPIResponse = {
	description?: string;
	content?: OpenAPIResponseContent;
};

type OpenAPIRequestBody = {
	required?: boolean;
	content: {
		"application/json": {
			schema: OpenAPISchema;
		};
	};
};

type OpenAPIOperation = {
	tags?: string[];
	operationId?: string;
	description?: string;
	security?: [{ bearerAuth: string[] }];
	parameters?: OpenAPIParameter[];
	requestBody?: OpenAPIRequestBody;
	responses?: Record<string, OpenAPIResponse>;
};

type AllowedType = "string" | "number" | "boolean" | "array" | "object";
const OPEN_API_SCHEMA_TYPES = new Set<AllowedType>([
	"string",
	"number",
	"boolean",
	"array",
	"object",
]);

function getOpenApiTypeFromZodType(zodType: z.ZodType<unknown>) {
	if (zodType instanceof z.ZodDefault || zodType instanceof z.ZodPrefault) {
		return getOpenApiTypeFromZodType(unwrapZodSchema(zodType));
	}
	const type = zodType.type;
	return OPEN_API_SCHEMA_TYPES.has(type as AllowedType)
		? (type as AllowedType)
		: "string";
}

export type FieldSchema = {
	type: DBFieldType;
	default?: DBFieldAttributeConfig["defaultValue"] | undefined;
	readOnly?: boolean | undefined;
	format?: string;
};

export type OpenAPIModelSchema = {
	type: "object";
	properties: Record<string, FieldSchema>;
	required?: string[] | undefined;
};

function getFieldSchema(field: DBFieldAttribute) {
	const schema: FieldSchema = {
		type: field.type === "date" ? "string" : field.type,
		...(field.type === "date" && { format: "date-time" }),
	};

	if (field.defaultValue !== undefined) {
		if (typeof field.defaultValue !== "function") {
			schema.default = field.defaultValue;
		}
	}

	if (field.input === false) {
		schema.readOnly = true;
	}

	return schema;
}

type ZodDef<T extends object> = {
	_def: T;
};

function asZodSchema(schema: unknown): z.ZodType<unknown> {
	return schema as z.ZodType<unknown>;
}

function unwrapZodSchema(
	zodType: z.ZodType<unknown> & { unwrap: () => unknown },
) {
	return asZodSchema(zodType.unwrap());
}

function getZodDef<T extends object>(zodType: z.ZodType<unknown>) {
	return (zodType as z.ZodType<unknown> & ZodDef<T>)._def;
}

function getZodDescription(zodType: z.ZodType<unknown>) {
	return (zodType as z.ZodType<unknown> & { description?: string }).description;
}

function withDescription(
	schema: OpenAPISchema,
	zodType: z.ZodType<unknown>,
): OpenAPISchema {
	const description = getZodDescription(zodType);
	return description ? { ...schema, description } : schema;
}

function addNullType(schema: OpenAPISchema): OpenAPISchema {
	if (schema.type) {
		const type: OpenAPISchemaPrimitiveType[] = Array.isArray(schema.type)
			? schema.type
			: [schema.type];
		const nullableType = Array.from(
			new Set<OpenAPISchemaPrimitiveType>([...type, "null"]),
		);
		return {
			...schema,
			type: nullableType,
		};
	}
	return {
		anyOf: [schema, { type: "null" satisfies OpenAPISchemaPrimitiveType }],
	};
}

function getZodStringSchemaConstraints(zodType: z.ZodType<unknown>) {
	const minLength = (
		zodType as z.ZodType<unknown> & { minLength?: number | null }
	).minLength;
	const maxLength = (
		zodType as z.ZodType<unknown> & { maxLength?: number | null }
	).maxLength;
	return {
		...(typeof minLength === "number" ? { minLength } : {}),
		...(typeof maxLength === "number" ? { maxLength } : {}),
	};
}

function getZodPipeSchema(zodType: z.ZodType<unknown>) {
	const def = getZodDef<{
		in: z.ZodType<unknown>;
		out: z.ZodType<unknown>;
	}>(zodType);
	return def.in instanceof z.ZodTransform && def.out instanceof z.ZodType
		? def.out
		: def.in;
}

function getParameters(options: EndpointOptions) {
	const parameters: OpenAPIParameter[] = [];
	if (options.metadata?.openapi?.parameters) {
		parameters.push(...options.metadata.openapi.parameters);
	}
	if (
		!options.metadata?.openapi?.parameters &&
		options.query instanceof z.ZodObject
	) {
		Object.entries(options.query.shape).forEach(([key, value]) => {
			if (value instanceof z.ZodType) {
				const parameterSchema = toOpenApiSchema(value as z.ZodType<unknown>);
				parameters.push({
					name: key,
					in: "query",
					schema: parameterSchema,
				});
			}
		});
	}
	return parameters;
}

function getPathParameters(path: string, parameters: OpenAPIParameter[]) {
	const existingParameters = new Set(
		parameters.map((parameter) => `${parameter.in}:${parameter.name}`),
	);
	return path
		.split("/")
		.filter((part) => part.startsWith(":"))
		.map((part) => part.slice(1))
		.filter((name) => !existingParameters.has(`path:${name}`))
		.map(
			(name) =>
				({
					name,
					in: "path",
					required: true,
					schema: {
						type: "string",
					},
				}) satisfies OpenAPIParameter,
		);
}

function getRequestBodySchemaInfo(zodType: z.ZodType<unknown>) {
	return {
		required: !schemaAcceptsUndefined(zodType),
		schema: zodType,
	};
}

function schemaAcceptsUndefined(zodType: z.ZodType<unknown>): boolean {
	if (
		zodType instanceof z.ZodOptional ||
		zodType instanceof z.ZodDefault ||
		zodType instanceof z.ZodPrefault ||
		zodType instanceof z.ZodCatch ||
		zodType instanceof z.ZodUndefined ||
		zodType instanceof z.ZodVoid
	) {
		return true;
	}
	if (zodType instanceof z.ZodNonOptional) {
		return false;
	}
	if (zodType instanceof z.ZodNullable || zodType instanceof z.ZodReadonly) {
		return schemaAcceptsUndefined(unwrapZodSchema(zodType));
	}
	if (zodType instanceof z.ZodPipe) {
		return schemaAcceptsUndefined(getZodPipeSchema(zodType));
	}
	if (zodType instanceof z.ZodUnion) {
		const def = getZodDef<{ options: z.ZodType<unknown>[] }>(zodType);
		return def.options.some((option) => schemaAcceptsUndefined(option));
	}
	if (zodType instanceof z.ZodIntersection) {
		const def = getZodDef<{
			left: z.ZodType<unknown>;
			right: z.ZodType<unknown>;
		}>(zodType);
		return (
			schemaAcceptsUndefined(def.left) && schemaAcceptsUndefined(def.right)
		);
	}
	return false;
}

function isUndefinedOnlySchema(zodType: z.ZodType<unknown>) {
	return zodType instanceof z.ZodUndefined || zodType instanceof z.ZodVoid;
}

function isMergeableObjectSchema(schema: OpenAPISchema) {
	const type = schema?.type;
	return (
		!!schema &&
		(type === "object" || (Array.isArray(type) && type.includes("object"))) &&
		schema.$ref === undefined &&
		schema.allOf === undefined &&
		schema.anyOf === undefined
	);
}

function schemaAllowsNull(schema: OpenAPISchema) {
	const type = schema?.type;
	return Array.isArray(type) && type.includes("null");
}

function areSchemasEqual(left: OpenAPISchema, right: OpenAPISchema) {
	return JSON.stringify(left) === JSON.stringify(right);
}

function areSchemaMembersCompatible(
	left: boolean | OpenAPISchema | undefined,
	right: boolean | OpenAPISchema | undefined,
) {
	if (left === undefined || right === undefined) {
		return true;
	}
	if (typeof left === "boolean" || typeof right === "boolean") {
		return left === right;
	}
	return areSchemasEqual(left, right);
}

function mergeObjectSchemas(
	left: OpenAPISchema,
	right: OpenAPISchema,
	description?: string,
): OpenAPISchema | undefined {
	const properties: Record<string, OpenAPISchema> = {
		...(left.properties || {}),
	};
	for (const [key, value] of Object.entries(right.properties || {})) {
		if (
			properties[key] !== undefined &&
			!areSchemasEqual(properties[key], value)
		) {
			return undefined;
		}
		properties[key] = value;
	}

	const required = Array.from(
		new Set([...(left.required || []), ...(right.required || [])]),
	);
	const leftAdditionalProperties = left.additionalProperties;
	const rightAdditionalProperties = right.additionalProperties;
	if (
		!areSchemaMembersCompatible(
			leftAdditionalProperties,
			rightAdditionalProperties,
		)
	) {
		return undefined;
	}
	const leftPropertyNames = left.propertyNames;
	const rightPropertyNames = right.propertyNames;
	if (!areSchemaMembersCompatible(leftPropertyNames, rightPropertyNames)) {
		return undefined;
	}
	const additionalProperties =
		leftAdditionalProperties ?? rightAdditionalProperties;
	const propertyNames = leftPropertyNames ?? rightPropertyNames;

	const type: OpenAPISchema["type"] =
		schemaAllowsNull(left) && schemaAllowsNull(right)
			? ["object", "null"]
			: "object";

	return {
		type,
		...(Object.keys(properties).length > 0 ? { properties } : {}),
		...(required.length > 0 ? { required } : {}),
		...(additionalProperties !== undefined ? { additionalProperties } : {}),
		...(propertyNames !== undefined ? { propertyNames } : {}),
		...((description ?? left.description ?? right.description)
			? {
					description: description ?? left.description ?? right.description,
				}
			: {}),
	};
}

function getRequestBody(
	options: EndpointOptions,
): OpenAPIRequestBody | undefined {
	if (options.metadata?.openapi?.requestBody) {
		return options.metadata.openapi.requestBody;
	}
	if (!options.body) return undefined;
	const requestBodySchemaInfo = getRequestBodySchemaInfo(
		options.body as z.ZodType<unknown>,
	);
	const schema = toOpenApiSchema(requestBodySchemaInfo.schema);
	return {
		required: requestBodySchemaInfo.required,
		content: {
			"application/json": {
				schema,
			},
		},
	};
}

function toOpenApiSchema(zodType: z.ZodType<unknown>): OpenAPISchema {
	if (zodType instanceof z.ZodOptional) {
		return toOpenApiSchema(unwrapZodSchema(zodType));
	}
	if (zodType instanceof z.ZodNullable) {
		return addNullType(toOpenApiSchema(unwrapZodSchema(zodType)));
	}
	if (
		zodType instanceof z.ZodDefault ||
		zodType instanceof z.ZodPrefault ||
		zodType instanceof z.ZodNonOptional
	) {
		return toOpenApiSchema(unwrapZodSchema(zodType));
	}
	if (zodType instanceof z.ZodAny) {
		return withDescription({}, zodType);
	}
	if (zodType instanceof z.ZodObject) {
		const shape = zodType.shape as Record<string, z.ZodType<unknown>>;
		if (shape) {
			const properties: Record<string, OpenAPISchema> = {};
			const required: string[] = [];
			Object.entries(shape).forEach(([key, value]) => {
				if (value instanceof z.ZodType) {
					properties[key] = toOpenApiSchema(value as z.ZodType<unknown>);
					if (!schemaAcceptsUndefined(value as z.ZodType<unknown>)) {
						required.push(key);
					}
				}
			});
			return withDescription(
				{
					type: "object",
					properties,
					...(required.length > 0 ? { required } : {}),
				},
				zodType,
			);
		}
	}
	if (zodType instanceof z.ZodRecord) {
		const def = getZodDef<{
			keyType: z.ZodType<unknown>;
			valueType: z.ZodType<unknown>;
		}>(zodType);
		return withDescription(
			{
				type: "object",
				propertyNames: toOpenApiSchema(def.keyType),
				additionalProperties: toOpenApiSchema(def.valueType),
			},
			zodType,
		);
	}
	if (zodType instanceof z.ZodIntersection) {
		const def = getZodDef<{
			left: z.ZodType<unknown>;
			right: z.ZodType<unknown>;
		}>(zodType);
		const leftSchema = toOpenApiSchema(def.left);
		const rightSchema = toOpenApiSchema(def.right);

		if (
			isMergeableObjectSchema(leftSchema) &&
			isMergeableObjectSchema(rightSchema)
		) {
			const mergedSchema = mergeObjectSchemas(
				leftSchema,
				rightSchema,
				getZodDescription(zodType),
			);
			if (mergedSchema) {
				return mergedSchema;
			}
		}

		return withDescription({ allOf: [leftSchema, rightSchema] }, zodType);
	}
	if (zodType instanceof z.ZodUnion) {
		const def = getZodDef<{
			options: z.ZodType<unknown>[];
			inclusive?: boolean;
		}>(zodType);
		const schemas = def.options
			.filter((option) => !isUndefinedOnlySchema(option))
			.map((option) => toOpenApiSchema(option));
		if (schemas.length === 0) {
			return withDescription({}, zodType);
		}
		if (schemas.length === 1) {
			const schema = schemas[0];
			if (!schema) {
				return withDescription({}, zodType);
			}
			return withDescription(schema, zodType);
		}
		const unionSchema =
			def.inclusive === false
				? ({ oneOf: schemas } satisfies OpenAPISchema)
				: ({ anyOf: schemas } satisfies OpenAPISchema);
		return withDescription(unionSchema, zodType);
	}
	if (zodType instanceof z.ZodArray) {
		const def = getZodDef<{ element: z.ZodType<unknown> }>(zodType);
		return withDescription(
			{
				type: "array",
				items: toOpenApiSchema(def.element),
			},
			zodType,
		);
	}
	if (zodType instanceof z.ZodLiteral) {
		const values = Array.from(
			(zodType as z.ZodType<unknown> & { values: Set<unknown> }).values,
		);
		return withDescription({ enum: values }, zodType);
	}
	if (zodType instanceof z.ZodEnum) {
		return withDescription(
			{
				type: "string",
				enum: zodType.options,
			},
			zodType,
		);
	}
	if (zodType instanceof z.ZodPipe) {
		return withDescription(toOpenApiSchema(getZodPipeSchema(zodType)), zodType);
	}
	if (zodType instanceof z.ZodCatch || zodType instanceof z.ZodReadonly) {
		const def = getZodDef<{ innerType: z.ZodType<unknown> }>(zodType);
		return withDescription(toOpenApiSchema(def.innerType), zodType);
	}
	if (zodType instanceof z.ZodNull) {
		return withDescription({ type: "null" }, zodType);
	}
	if (zodType instanceof z.ZodUndefined) {
		return withDescription({}, zodType);
	}
	if (zodType instanceof z.ZodVoid) {
		return withDescription({}, zodType);
	}

	const baseSchema = {
		type: getOpenApiTypeFromZodType(zodType),
		...(zodType instanceof z.ZodString
			? getZodStringSchemaConstraints(zodType)
			: {}),
	};

	return withDescription(baseSchema, zodType);
}

function getResponse(
	responses?: Record<string, OpenAPIResponse> | undefined,
): Record<string, OpenAPIResponse> {
	return {
		"400": {
			content: {
				"application/json": {
					schema: {
						type: "object",
						properties: {
							message: {
								type: "string",
							},
						},
						required: ["message"],
					},
				},
			},
			description:
				"Bad Request. Usually due to missing parameters, or invalid parameters.",
		},
		"401": {
			content: {
				"application/json": {
					schema: {
						type: "object",
						properties: {
							message: {
								type: "string",
							},
						},
						required: ["message"],
					},
				},
			},
			description: "Unauthorized. Due to missing or invalid authentication.",
		},
		"403": {
			content: {
				"application/json": {
					schema: {
						type: "object",
						properties: {
							message: {
								type: "string",
							},
						},
					},
				},
			},
			description:
				"Forbidden. You do not have permission to access this resource or to perform this action.",
		},
		"404": {
			content: {
				"application/json": {
					schema: {
						type: "object",
						properties: {
							message: {
								type: "string",
							},
						},
					},
				},
			},
			description: "Not Found. The requested resource was not found.",
		},
		"429": {
			content: {
				"application/json": {
					schema: {
						type: "object",
						properties: {
							message: {
								type: "string",
							},
						},
					},
				},
			},
			description:
				"Too Many Requests. You have exceeded the rate limit. Try again later.",
		},
		"500": {
			content: {
				"application/json": {
					schema: {
						type: "object",
						properties: {
							message: {
								type: "string",
							},
						},
					},
				},
			},
			description:
				"Internal Server Error. This is a problem with the server that you cannot fix.",
		},
		...(responses ? structuredClone(responses) : {}),
	};
}

function toOpenApiPath(path: string) {
	// /reset-password/:token -> /reset-password/{token}
	// replace all : with {}
	return path
		.split("/")
		.map((part) => (part.startsWith(":") ? `{${part.slice(1)}}` : part))
		.join("/");
}

function getOperationId(
	operationId: string | undefined,
	method: string,
	usedOperationIds: Set<string>,
) {
	if (!operationId) {
		return undefined;
	}
	if (!usedOperationIds.has(operationId)) {
		usedOperationIds.add(operationId);
		return operationId;
	}
	const normalizedMethod = method.toUpperCase();
	const methodSuffix =
		normalizedMethod.charAt(0) + normalizedMethod.slice(1).toLowerCase();
	let candidate = `${operationId}${methodSuffix}`;
	let duplicateIndex = 2;
	while (usedOperationIds.has(candidate)) {
		candidate = `${operationId}${methodSuffix}${duplicateIndex}`;
		duplicateIndex += 1;
	}
	usedOperationIds.add(candidate);
	return candidate;
}

function cloneOpenAPIValue<T>(value: T): T {
	if (Array.isArray(value)) {
		return value.map((item) => cloneOpenAPIValue(item)) as T;
	}

	if (value instanceof Date) {
		return new Date(value) as T;
	}

	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([key, entry]) => [
				key,
				cloneOpenAPIValue(entry),
			]),
		) as T;
	}

	return value;
}

export async function generator(ctx: AuthContext, options: BetterAuthOptions) {
	const baseEndpoints = getEndpoints(ctx, {
		...options,
		plugins: [],
	});

	const tables = getAuthTables({
		...options,
		session: {
			...options.session,
			storeSessionInDatabase: true, // Forcing this to true to return the session table schema
		},
	});
	const models = Object.entries(tables).reduce<
		Record<string, OpenAPIModelSchema>
	>((acc, [key, value]) => {
		const modelName = key.charAt(0).toUpperCase() + key.slice(1);
		const fields = value.fields;
		const required = new Set<string>(["id"]);
		const properties: Record<string, FieldSchema> = {
			id: { type: "string", readOnly: true },
		};
		Object.entries(fields).forEach(([fieldKey, fieldValue]) => {
			if (!fieldValue) return;
			properties[fieldKey] = getFieldSchema(fieldValue);
			if (fieldValue.required && fieldValue.returned !== false) {
				required.add(fieldKey);
			}
		});

		Object.entries(properties).forEach(([key, prop]) => {
			const field = value.fields[key];
			if (field && field.type === "date" && prop.type === "string") {
				prop.format = "date-time";
			}
		});
		acc[modelName] = {
			type: "object",
			properties,
			required: Array.from(required),
		};
		return acc;
	}, {});

	const components = {
		schemas: {
			...models,
		},
	};

	const paths: Record<string, Path> = {};
	const usedOperationIds = new Set<string>();

	Object.entries(baseEndpoints.api).forEach(([_, value]) => {
		if (!value.path || ctx.options.disabledPaths?.includes(value.path)) return;
		const options = value.options as EndpointOptions;
		if (options.metadata?.SERVER_ONLY) return;
		const path = toOpenApiPath(value.path);
		const operationParameters = getParameters(options);
		const parameters = [
			...operationParameters,
			...getPathParameters(value.path, operationParameters),
		];
		const methods = Array.isArray(options.method)
			? options.method
			: [options.method];
		for (const method of methods.filter((m) => m === "GET" || m === "DELETE")) {
			paths[path] = {
				...paths[path],
				[method.toLowerCase()]: {
					tags: ["Default", ...(options.metadata?.openapi?.tags || [])],
					description: options.metadata?.openapi?.description,
					operationId: getOperationId(
						options.metadata?.openapi?.operationId,
						method,
						usedOperationIds,
					),
					security: [
						{
							bearerAuth: [],
						},
					],
					parameters: cloneOpenAPIValue(parameters),
					responses: cloneOpenAPIValue(
						getResponse(options.metadata?.openapi?.responses),
					),
				},
			};
		}
		for (const method of methods.filter(
			(m) => m === "POST" || m === "PATCH" || m === "PUT",
		)) {
			const body = getRequestBody(options);
			paths[path] = {
				...paths[path],
				[method.toLowerCase()]: {
					tags: ["Default", ...(options.metadata?.openapi?.tags || [])],
					description: options.metadata?.openapi?.description,
					operationId: getOperationId(
						options.metadata?.openapi?.operationId,
						method,
						usedOperationIds,
					),
					security: [
						{
							bearerAuth: [],
						},
					],
					parameters: cloneOpenAPIValue(parameters),
					...(body
						? { requestBody: cloneOpenAPIValue(body) }
						: {
								requestBody: {
									//set body none
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {},
											},
										},
									},
								},
							}),
					responses: cloneOpenAPIValue(
						getResponse(options.metadata?.openapi?.responses),
					),
				},
			};
		}
	});

	for (const plugin of options.plugins || []) {
		if (plugin.id === "open-api") {
			continue;
		}
		const pluginEndpoints = getEndpoints(ctx, {
			...options,
			plugins: [plugin],
		});
		const api = Object.keys(pluginEndpoints.api)
			.map((key) => {
				if (
					baseEndpoints.api[key as keyof typeof baseEndpoints.api] === undefined
				) {
					return pluginEndpoints.api[key as keyof typeof pluginEndpoints.api];
				}
				return null;
			})
			.filter((x) => x !== null) as Endpoint[];
		Object.entries(api).forEach(([key, value]) => {
			if (!value.path || ctx.options.disabledPaths?.includes(value.path))
				return;
			const options = value.options as EndpointOptions;
			if (options.metadata?.SERVER_ONLY) return;
			const path = toOpenApiPath(value.path);
			const operationParameters = getParameters(options);
			const parameters = [
				...operationParameters,
				...getPathParameters(value.path, operationParameters),
			];
			const methods = Array.isArray(options.method)
				? options.method
				: [options.method];
			for (const method of methods.filter(
				(m) => m === "GET" || m === "DELETE",
			)) {
				paths[path] = {
					...paths[path],
					[method.toLowerCase()]: {
						tags: options.metadata?.openapi?.tags || [
							plugin.id.charAt(0).toUpperCase() + plugin.id.slice(1),
						],
						description: options.metadata?.openapi?.description,
						operationId: getOperationId(
							options.metadata?.openapi?.operationId,
							method,
							usedOperationIds,
						),
						security: [
							{
								bearerAuth: [],
							},
						],
						parameters: cloneOpenAPIValue(parameters),
						responses: cloneOpenAPIValue(
							getResponse(options.metadata?.openapi?.responses),
						),
					},
				};
			}
			for (const method of methods.filter(
				(m) => m === "POST" || m === "PATCH" || m === "PUT",
			)) {
				paths[path] = {
					...paths[path],
					[method.toLowerCase()]: {
						tags: options.metadata?.openapi?.tags || [
							plugin.id.charAt(0).toUpperCase() + plugin.id.slice(1),
						],
						description: options.metadata?.openapi?.description,
						operationId: getOperationId(
							options.metadata?.openapi?.operationId,
							method,
							usedOperationIds,
						),
						security: [
							{
								bearerAuth: [],
							},
						],
						parameters: cloneOpenAPIValue(parameters),
						requestBody: cloneOpenAPIValue(getRequestBody(options)),
						responses: cloneOpenAPIValue(
							getResponse(options.metadata?.openapi?.responses),
						),
					},
				};
			}
		});
	}

	const res = {
		openapi: "3.1.1",
		info: {
			title: "Better Auth",
			description: "API Reference for your Better Auth Instance",
			version: "1.1.0",
		},
		components: {
			...components,
			securitySchemes: {
				apiKeyCookie: {
					type: "apiKey",
					in: "cookie",
					name: "apiKeyCookie",
					description: "API Key authentication via cookie",
				},
				bearerAuth: {
					type: "http",
					scheme: "bearer",
					description: "Bearer token authentication",
				},
			},
		},
		security: [
			{
				apiKeyCookie: [],
				bearerAuth: [],
			},
		],
		servers: [
			{
				url: ctx.baseURL,
			},
		],
		tags: [
			{
				name: "Default",
				description:
					"Default endpoints that are included with Better Auth by default. These endpoints are not part of any plugin.",
			},
		],
		paths,
	};
	return res;
}
