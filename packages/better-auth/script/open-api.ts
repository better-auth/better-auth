import type { EndpointOptions } from "better-call";
import { betterAuth } from "../src";
import { ZodObject, ZodSchema, ZodString } from "zod";
import type { OpenAPISchemaType, OpenAPIParameter } from "better-call";
import fs from "fs/promises";
import { oAuthProxy } from "../src/plugins";
export const auth = betterAuth({
	plugins: [oAuthProxy()],
});

const components = {
	schemas: {
		ErrBadRequest: {
			type: "object",
			properties: {
				error: {
					type: "object",
					properties: {
						message: {
							type: "string",
							description: "A human readable explanation of what went wrong",
						},
					},
					required: ["message"],
				},
			},
			required: ["error"],
		},
	},
};

const errors = {
	badRequest: "ErrBadRequest",
};

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

Object.entries(auth.api).forEach(([key, value]) => {
	const options = value.options as EndpointOptions;
	if (options.method === "GET") {
		paths[value.path] = {
			get: {
				tags: options.metadata?.openapi?.tags,
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

async function main() {
	const pkgJSON = await fs.readFile("./package.json", {
		encoding: "utf-8",
	});

	const version = JSON.parse(pkgJSON).version;

	fs.writeFile(
		"./script/open-api.json",
		JSON.stringify(
			{
				openapi: "3.1.1",
				info: {
					title: "Better Auth Api",
					version,
				},
				paths,
			},
			null,
			2,
		),
	);
}

main();
