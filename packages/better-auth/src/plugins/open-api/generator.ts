import type { AuthContext, BetterAuthOptions } from "@better-auth/core";
import type {
	DBFieldAttribute,
	DBFieldAttributeConfig,
	DBFieldType,
} from "@better-auth/core/db";
import type {
	Endpoint,
	EndpointOptions,
	OpenAPIParameter,
	OpenAPISchemaType,
} from "better-call";
import * as z from "zod";
import { getEndpoints } from "../../api";
import { getAuthTables } from "../../db";

export interface Path {
	get?:
		| {
				tags?: string[];
				operationId?: string;
				description?: string;
				security?: [{ bearerAuth: string[] }];
				parameters?: OpenAPIParameter[];
				responses?: {
					[key in string]: {
						description?: string;
						content: {
							"application/json": {
								schema: {
									type?: OpenAPISchemaType;
									properties?: Record<string, any>;
									required?: string[];
									$ref?: string;
								};
							};
						};
					};
				};
		  }
		| undefined;
	post?:
		| {
				tags?: string[];
				operationId?: string;
				description?: string;
				security?: [{ bearerAuth: string[] }];
				parameters?: OpenAPIParameter[];
				requestBody?: {
					content: {
						"application/json": {
							schema: {
								type?: OpenAPISchemaType;
								properties?: Record<string, any>;
								required?: string[];
								$ref?: string;
							};
						};
					};
				};
				responses?: {
					[key in string]: {
						description?: string;
						content: {
							"application/json": {
								schema: {
									type?: OpenAPISchemaType;
									properties?: Record<string, any>;
									required?: string[];
									$ref?: string;
								};
							};
						};
					};
				};
		  }
		| undefined;
}

type AllowedType = "string" | "number" | "boolean" | "array" | "object";
const allowedType = new Set(["string", "number", "boolean", "array", "object"]);
function getTypeFromZodType(zodType: z.ZodType<any>) {
	const type = zodType.type;
	return allowedType.has(type) ? (type as AllowedType) : "string";
}

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

function getFieldSchema(field: DBFieldAttribute) {
	const schema: FieldSchema = {
		type: field.type === "date" ? "string" : field.type,
		...(field.type === "date" && { format: "date-time" }),
	};

	if (field.defaultValue !== undefined) {
		schema.default =
			typeof field.defaultValue === "function"
				? "Generated at runtime"
				: field.defaultValue;
	}

	if (field.input === false) {
		schema.readOnly = true;
	}

	return schema;
}

function getParameters(options: EndpointOptions) {
	const parameters: OpenAPIParameter[] = [];
	if (options.metadata?.openapi?.parameters) {
		parameters.push(...options.metadata.openapi.parameters);
		return parameters;
	}
	if (options.query instanceof z.ZodObject) {
		Object.entries(options.query.shape).forEach(([key, value]) => {
			if (value instanceof z.ZodType) {
				parameters.push({
					name: key,
					in: "query",
					schema: {
						...processZodType(value as z.ZodType<any>),
						...("minLength" in value && (value as any).minLength
							? {
									minLength: (value as any).minLength as number,
								}
							: {}),
					},
				});
			}
		});
	}
	return parameters;
}

function getRequestBody(options: EndpointOptions): any {
	if (options.metadata?.openapi?.requestBody) {
		return options.metadata.openapi.requestBody;
	}
	if (!options.body) return undefined;
	if (
		options.body instanceof z.ZodObject ||
		options.body instanceof z.ZodOptional
	) {
		// @ts-expect-error
		const shape = options.body.shape;
		if (!shape) return undefined;
		const properties: Record<string, any> = {};
		const required: string[] = [];
		Object.entries(shape).forEach(([key, value]) => {
			if (value instanceof z.ZodType) {
				properties[key] = processZodType(value as z.ZodType<any>);
				if (!(value instanceof z.ZodOptional)) {
					required.push(key);
				}
			}
		});
		return {
			required:
				options.body instanceof z.ZodOptional
					? false
					: options.body
						? true
						: false,
			content: {
				"application/json": {
					schema: {
						type: "object",
						properties,
						required,
					},
				},
			},
		};
	}
	return undefined;
}

function processZodType(zodType: z.ZodType<any>): any {
	// optional unwrapping
	if (zodType instanceof z.ZodOptional) {
		const innerType = (zodType as any)._def.innerType;
		const innerSchema = processZodType(innerType);
		return {
			...innerSchema,
			nullable: true,
		};
	}
	// object unwrapping
	if (zodType instanceof z.ZodObject) {
		const shape = (zodType as any).shape;
		if (shape) {
			const properties: Record<string, any> = {};
			const required: string[] = [];
			Object.entries(shape).forEach(([key, value]) => {
				if (value instanceof z.ZodType) {
					properties[key] = processZodType(value as z.ZodType<any>);
					if (!(value instanceof z.ZodOptional)) {
						required.push(key);
					}
				}
			});
			return {
				type: "object",
				properties,
				...(required.length > 0 ? { required } : {}),
				description: (zodType as any).description,
			};
		}
	}

	// For primitive types, get the correct type from the unwrapped ZodType
	const baseSchema = {
		type: getTypeFromZodType(zodType),
		description: (zodType as any).description,
	};

	return baseSchema;
}

function getResponse(responses?: Record<string, any> | undefined) {
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
		...responses,
	} as any;
}

function toOpenApiPath(path: string) {
	// /reset-password/:token -> /reset-password/{token}
	// replace all : with {}
	return path
		.split("/")
		.map((part) => (part.startsWith(":") ? `{${part.slice(1)}}` : part))
		.join("/");
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
		const required: string[] = [];
		const properties: Record<string, FieldSchema> = {
			id: { type: "string" },
		};
		Object.entries(fields).forEach(([fieldKey, fieldValue]) => {
			if (!fieldValue) return;
			properties[fieldKey] = getFieldSchema(fieldValue);
			if (fieldValue.required && fieldValue.input !== false) {
				required.push(fieldKey);
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
			required,
		};
		return acc;
	}, {});

	const components = {
		schemas: {
			...models,
		},
	};

	const paths: Record<string, Path> = {};

	Object.entries(baseEndpoints.api).forEach(([_, value]) => {
		if (ctx.options.disabledPaths?.includes(value.path)) return;
		const options = value.options as EndpointOptions;
		if (options.metadata?.SERVER_ONLY) return;
		const path = toOpenApiPath(value.path);
		if (options.method === "GET" || options.method === "DELETE") {
			paths[path] = {
				...paths[path],
				[options.method.toLowerCase()]: {
					tags: ["Default", ...(options.metadata?.openapi?.tags || [])],
					description: options.metadata?.openapi?.description,
					operationId: options.metadata?.openapi?.operationId,
					security: [
						{
							bearerAuth: [],
						},
					],
					parameters: getParameters(options),
					responses: getResponse(options.metadata?.openapi?.responses),
				},
			};
		}

		if (
			options.method === "POST" ||
			options.method === "PATCH" ||
			options.method === "PUT"
		) {
			const body = getRequestBody(options);
			paths[path] = {
				...paths[path],
				[options.method.toLowerCase()]: {
					tags: ["Default", ...(options.metadata?.openapi?.tags || [])],
					description: options.metadata?.openapi?.description,
					operationId: options.metadata?.openapi?.operationId,
					security: [
						{
							bearerAuth: [],
						},
					],
					parameters: getParameters(options),
					...(body
						? { requestBody: body }
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
					responses: getResponse(options.metadata?.openapi?.responses),
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
			if (ctx.options.disabledPaths?.includes(value.path)) return;
			const options = value.options as EndpointOptions;
			if (options.metadata?.SERVER_ONLY) return;
			const path = toOpenApiPath(value.path);
			if (options.method === "GET" || options.method === "DELETE") {
				paths[path] = {
					...paths[path],
					[options.method.toLowerCase()]: {
						tags: options.metadata?.openapi?.tags || [
							plugin.id.charAt(0).toUpperCase() + plugin.id.slice(1),
						],
						description: options.metadata?.openapi?.description,
						operationId: options.metadata?.openapi?.operationId,
						security: [
							{
								bearerAuth: [],
							},
						],
						parameters: getParameters(options),
						responses: getResponse(options.metadata?.openapi?.responses),
					},
				};
			}
			if (
				options.method === "POST" ||
				options.method === "PATCH" ||
				options.method === "PUT"
			) {
				paths[path] = {
					...paths[path],
					[options.method.toLowerCase()]: {
						tags: options.metadata?.openapi?.tags || [
							plugin.id.charAt(0).toUpperCase() + plugin.id.slice(1),
						],
						description: options.metadata?.openapi?.description,
						operationId: options.metadata?.openapi?.operationId,
						security: [
							{
								bearerAuth: [],
							},
						],
						parameters: getParameters(options),
						requestBody: getRequestBody(options),
						responses: getResponse(options.metadata?.openapi?.responses),
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
