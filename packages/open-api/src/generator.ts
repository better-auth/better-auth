import type { Endpoint, EndpointOptions } from "better-call";
import { ZodObject, ZodSchema } from "zod";
import type { OpenAPISchemaType, OpenAPIParameter } from "better-call";
import type { AuthContext, BetterAuthOptions } from "better-auth";
import { getEndpoints } from "better-auth/api";

interface Path {
	get?: {
		tags?: string[];
		operationId?: string;
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

export async function generator(ctx: AuthContext, options: BetterAuthOptions) {
	const baseEndpoints = getEndpoints(ctx, {
		...options,
		plugins: [],
	});

	Object.entries(baseEndpoints.api).forEach(([_, value]) => {
		const options = value.options as EndpointOptions;
		if (options.method === "GET") {
			paths[value.path] = {
				get: {
					tags: ["core", ...(options.metadata?.openapi?.tags || [])],
					operationId: options.metadata?.openapi?.operationId,
					security: [
						{
							bearerAuth: [],
						},
					],
					parameters: getParameters(options),
					responses: options.metadata?.openapi?.responses || {
						"200": {
							description: "Success",
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
						},
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
						},
					},
				},
			};
		}
	});

	for (const plugin of options.plugins || []) {
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
			const options = value.options as EndpointOptions;
			if (options.method === "GET") {
				paths[value.path] = {
					get: {
						tags: options.metadata?.openapi?.tags || [plugin.id],
						operationId: options.metadata?.openapi?.operationId,
						security: [
							{
								bearerAuth: [],
							},
						],
						parameters: getParameters(options),
						responses: options.metadata?.openapi?.responses || {
							"200": {
								description: "Success",
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
							},
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
							},
						},
					},
				};
			}
		});
	}

	const res = {
		openapi: "3.1.1",
		info: {
			title: "Better Auth Api",
			description: "API Reference for your Better Auth Instance",
		},
		security: [
			{
				apiKeyCookie: [],
			},
		],
		servers: [
			{
				url: ctx.baseURL,
			},
		],
		tags: [
			{
				name: "Authentication",
				description:
					"Some endpoints are public, but some require authentication. We provide all the required endpoints to create an account and authorize yourself.",
			},
		],
		paths,
	};
	return res;
}
