export class BetterAuthError extends Error {
	constructor(message: string, cause?: string, docsLink?: string) {
		super(message);
		this.name = "BetterAuthError";
		this.message = message;
		this.cause = cause;
	}
}
