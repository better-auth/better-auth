import type { EndpointOptions } from "better-call";
import { betterAuth } from "../src";
import { ZodObject, ZodString } from "zod";

export const auth = betterAuth({});

type SchemaType = "string" | "number" | "boolean" | "object" | "array";

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
		security?: {
			bearerAuth: string[];
		};
		parameters?: {
			schema?: {
				type: SchemaType;
				minLength: number;
				description?: string;
				example?: string;
			};
			required?: boolean;
			name: string;
			in: string;
		}[];
		responses?: {
			[key in 200 | 400 | 401 | 403 | 500]: {
				description?: string;
				content: {
					"application/json": {
						schema: {
							type?: SchemaType;
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

Object.entries(auth.api).forEach(([key, value]) => {
	const options = value.options as EndpointOptions;
	if (options.method === "GET") {
		if (options.query instanceof ZodObject) {
			Object.entries(options.query.shape).forEach(([key, value]) => {
				if (value instanceof ZodString) {
					console.log(value);
				}
			});
		}
	}
});
