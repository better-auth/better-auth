import type { Status } from "better-auth";
import { APIError } from "better-auth";
import { statusCodes } from "better-call";

/**
 * SCIM compliant error
 * See: https://datatracker.ietf.org/doc/html/rfc7644#section-3.12
 */
export class SCIMAPIError extends APIError {
	constructor(
		status: keyof typeof statusCodes | Status = "INTERNAL_SERVER_ERROR",
		overrides: any = {},
	) {
		const body = {
			schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
			status: (typeof status === "number"
				? status
				: statusCodes[status]
			).toString(),
			detail: overrides.detail,
			...overrides,
		};
		super(status, body);
		this.message = body.detail ?? body.message;
	}
}

const SCIMErrorOpenAPISchema = {
	type: "object",
	properties: {
		schemas: {
			type: "array",
			items: { type: "string" },
		},
		status: {
			type: "string",
		},
		detail: {
			type: "string",
		},
		scimType: {
			type: "string",
		},
	},
} as const;

export const SCIMErrorOpenAPISchemas = {
	"400": {
		description:
			"Bad Request. Usually due to missing parameters, or invalid parameters",
		content: {
			"application/json": {
				schema: SCIMErrorOpenAPISchema,
			},
		},
	},
	"401": {
		description: "Unauthorized. Due to missing or invalid authentication.",
		content: {
			"application/json": {
				schema: SCIMErrorOpenAPISchema,
			},
		},
	},
	"403": {
		description: "Unauthorized. Due to missing or invalid authentication.",
		content: {
			"application/json": {
				schema: SCIMErrorOpenAPISchema,
			},
		},
	},
	"404": {
		description: "Not Found. The requested resource was not found.",
		content: {
			"application/json": {
				schema: SCIMErrorOpenAPISchema,
			},
		},
	},
	"429": {
		description:
			"Too Many Requests. You have exceeded the rate limit. Try again later.",
		content: {
			"application/json": {
				schema: SCIMErrorOpenAPISchema,
			},
		},
	},
	"500": {
		description:
			"Internal Server Error. This is a problem with the server that you cannot fix.",
		content: {
			"application/json": {
				schema: SCIMErrorOpenAPISchema,
			},
		},
	},
};
