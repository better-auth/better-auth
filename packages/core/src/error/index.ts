export class BetterAuthError extends Error {
	constructor(message: string, options?: { cause?: unknown | undefined }) {
		super(message, options);
		this.name = "BetterAuthError";
		this.message = message;
		this.stack = "";
	}
}

export { BASE_ERROR_CODES } from "./codes";
