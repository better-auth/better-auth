import { APIError as BaseAPIError } from "better-call/error";

export class BetterAuthError extends Error {
	constructor(message: string, options?: { cause?: unknown | undefined }) {
		super(message, options);
		this.name = "BetterAuthError";
		this.message = message;
		this.stack = "";
	}
}

export { type APIErrorCode, BASE_ERROR_CODES } from "./codes";

type BaseAPIErrorInstance = InstanceType<typeof BaseAPIError>;

export class APIError extends BaseAPIError {
	declare status: BaseAPIErrorInstance["status"];
	declare body: BaseAPIErrorInstance["body"];
	declare headers: BaseAPIErrorInstance["headers"];
	declare statusCode: BaseAPIErrorInstance["statusCode"];
	declare message: string;

	constructor(...args: ConstructorParameters<typeof BaseAPIError>) {
		super(...args);
	}

	static fromStatus(
		status: ConstructorParameters<typeof BaseAPIError>[0],
		body?: ConstructorParameters<typeof BaseAPIError>[1],
	) {
		return new APIError(status, body);
	}

	static from(
		status: ConstructorParameters<typeof BaseAPIError>[0],
		error: { code: string; message: string },
	) {
		return new APIError(status, {
			message: error.message,
			code: error.code,
		});
	}
}
