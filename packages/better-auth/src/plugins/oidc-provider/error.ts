import { APIError } from "@better-auth/core/error";

class OIDCProviderError extends APIError {}

export class InvalidRequest extends OIDCProviderError {
	constructor(error_description: string, error_detail?: string) {
		super("BAD_REQUEST", {
			message: error_description,
			error: "invalid_request",
			error_description,
			error_detail,
		});
	}
}

export class InvalidClient extends OIDCProviderError {
	constructor(error_description: string) {
		super("BAD_REQUEST", {
			message: error_description,
			error: "invalid_client",
			error_description,
		});
	}
}
