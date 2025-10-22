export class BetterAuthError extends Error {
	constructor(message: string, cause?: string) {
		super(message);
		this.name = "BetterAuthError";
		this.message = message;
		this.cause = cause;
		this.stack = "";
	}
}

export { BASE_ERROR_CODES } from "./codes";
