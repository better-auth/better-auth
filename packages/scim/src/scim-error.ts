import type { Status } from "better-auth";
import { APIError } from "better-auth";
import { isAPIError } from "better-auth/api";
import { statusCodes } from "better-call";

const SCIM_ERROR_SCHEMA =
	"urn:ietf:params:scim:api:messages:2.0:Error" as const;

export type SCIMErrorType =
	| "invalidFilter"
	| "tooMany"
	| "uniqueness"
	| "mutability"
	| "invalidSyntax"
	| "invalidPath"
	| "noTarget"
	| "invalidValue"
	| "invalidVers"
	| "sensitive";

export interface SCIMErrorOptions {
	detail?: string;
	scimType?: SCIMErrorType;
}

/**
 * Create a SCIM-compliant API error.
 *
 * See: https://datatracker.ietf.org/doc/html/rfc7644#section-3.12
 */
export function createSCIMError(
	status: keyof typeof statusCodes | Status = "INTERNAL_SERVER_ERROR",
	options: SCIMErrorOptions = {},
): APIError {
	const body = {
		schemas: [SCIM_ERROR_SCHEMA],
		status: (typeof status === "number"
			? status
			: statusCodes[status]
		).toString(),
		...(options.detail !== undefined ? { detail: options.detail } : {}),
		...(options.scimType !== undefined ? { scimType: options.scimType } : {}),
	};
	const error = new APIError(status, body);
	if (options.detail !== undefined) error.message = options.detail;
	return error;
}

/**
 * Keeps application-owned SCIM extension failures inside the SCIM error
 * contract while preserving the original exception as a non-response cause.
 */
export async function runSCIMApplicationCallback<Result>(
	callback: () => Result | Promise<Result>,
	detail: string,
): Promise<Result> {
	try {
		return await callback();
	} catch (error) {
		if (isAPIError(error)) throw error;
		const scimError = createSCIMError("INTERNAL_SERVER_ERROR", { detail });
		Object.defineProperty(scimError, "cause", {
			configurable: true,
			value: error,
		});
		throw scimError;
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
	required: ["schemas", "status"] as string[],
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
	"409": {
		description: "Conflict. A resource uniqueness constraint was violated.",
		content: {
			"application/json": {
				schema: SCIMErrorOpenAPISchema,
			},
		},
	},
	"415": {
		description: "Unsupported Media Type.",
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
