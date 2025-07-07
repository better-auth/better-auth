import type {
	Endpoint,
	EndpointOptions,
	OpenAPIParameter,
	OpenAPISchemaType,
} from "better-call";
import { ZodObject, ZodOptional, ZodSchema } from "zod";
import { getEndpoints } from "../../api";
import { getAuthTables } from "../../db";
import type { AuthContext, BetterAuthOptions } from "../../types";

export interface Path {
	get?: {
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
	};
	post?: {
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
	};
}
const paths: Record<string, Path> = {};

function getTypeFromZodType(zodType: ZodSchema) {
	switch (zodType.constructor.name) {
		case "ZodString":
			return "string";
		case "ZodNumber":
			return "number";
		case "ZodBoolean":
			return "boolean";
		case "ZodObject":
			return "object";
		case "ZodArray":
			return "array";
		default:
			return "string";
	}
}

function getParameters(options: EndpointOptions) {
	const parameters: OpenAPIParameter[] = [];
	if (options.metadata?.openapi?.parameters) {
		parameters.push(...options.metadata.openapi.parameters);
		return parameters;
	}
	if (options.query instanceof ZodObject) {
		Object.entries(options.query.shape).forEach(([key, value]) => {
			if (value instanceof ZodSchema) {
				parameters.push({
					name: key,
					in: "query",
					schema: {
						type: getTypeFromZodType(value),
						...("minLength" in value && value.minLength
							? {
									minLength: value.minLength as number,
								}
							: {}),
						description: value.description,
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
		options.body instanceof ZodObject ||
		options.body instanceof ZodOptional
	) {
		// @ts-ignore
		const shape = options.body.shape;
		if (!shape) return undefined;
		const properties: Record<string, any> = {};
		const required: string[] = [];
		Object.entries(shape).forEach(([key, value]) => {
			if (value instanceof ZodSchema) {
				properties[key] = {
					type: getTypeFromZodType(value),
					description: value.description,
				};
				if (!(value instanceof ZodOptional)) {
					required.push(key);
				}
			}
		});
		return {
			required:
				options.body instanceof ZodOptional
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

function getResponse(responses?: Record<string, any>) {
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

	const tables = getAuthTables(options);
	const models = Object.entries(tables).reduce((acc, [key, value]) => {
		const modelName = key.charAt(0).toUpperCase() + key.slice(1);
		// @ts-ignore
		acc[modelName] = {
			type: "object",
			properties: Object.entries(value.fields).reduce(
				(acc, [key, value]) => {
					acc[key] = {
						type: value.type,
					};
					return acc;
				},
				{ id: { type: "string" } } as Record<string, any>,
			),
		};
		return acc;
	}, {});

	const components = {
		schemas: {
			...models,
		},
	};

	Object.entries(baseEndpoints.api).forEach(([_, value]) => {
		if (ctx.options.disabledPaths?.includes(value.path)) return;
		const options = value.options as EndpointOptions;
		if (options.metadata?.SERVER_ONLY) return;
		const path = toOpenApiPath(value.path);
		if (options.method === "GET") {
			paths[path] = {
				get: {
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

		if (options.method === "POST") {
			const body = getRequestBody(options);
			paths[path] = {
				post: {
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
			if (options.method === "GET") {
				paths[path] = {
					get: {
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
			if (options.method === "POST") {
				paths[path] = {
					post: {
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
