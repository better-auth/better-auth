export type BetterAuthErrorResponse = {
	message: string;
	details: string;
	code: number;
};

export class BetterAuthError extends Error {
	constructor(message: string) {
		super(`${message}`);
		this.name = this.constructor.name;
		Object.setPrototypeOf(this, new.target.prototype);
		Error.captureStackTrace(this, this.constructor);
	}
}

export class MissingSecret extends BetterAuthError {
	constructor() {
		super("Missing Secret: A secret is required in a production environment.");
	}
}

export class InvalidURL extends BetterAuthError {
	constructor(message?: string) {
		super(
			message ||
				"Please make sure your config includes valid base URL and base PATH.",
		);
	}
}

export class InvalidRequest extends BetterAuthError {
	constructor() {
		super("Post requests must include a valid JSON parsable body.");
	}
}

export class ProviderMissing extends BetterAuthError {
	constructor(id: string) {
		super(`Provider ${id} is missing on your configuration.`);
	}
}

export class ProviderError extends BetterAuthError {}

export class CallbackError extends BetterAuthError {}

export class BaseURLMissing extends BetterAuthError {
	constructor() {
		super(
			"base url is required. Please provide a base url in your config or pass it as an environment variable.",
		);
	}
}
