import type { Status } from "better-auth";
import { APIError } from "better-auth";
import { _statusCode } from "better-call";

/**
 * SCIM compliant error
 * See: https://datatracker.ietf.org/doc/html/rfc7644#section-3.12
 */
export class SCIMAPIError extends APIError {
	constructor(
		status: keyof typeof _statusCode | Status = "INTERNAL_SERVER_ERROR",
		overrides: any = {},
	) {
		const body = {
			schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
			status: typeof status === "number" ? status : _statusCode[status],
			detail: overrides.detail,
			...overrides,
		};
		super(status, body);
		this.message = body.detail ?? body.message;
	}
}
