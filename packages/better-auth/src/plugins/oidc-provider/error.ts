import { APIError } from "@better-auth/core/error";

class OIDCProviderError extends APIError {}

export class InvalidRequest extends OIDCProviderError {
	constructor(error_description: string, error_detail?: string) {
		super("BAD_REQUEST", {
			message: "invalid_request",
			error_description,
			error_detail,
		});
	}
}
