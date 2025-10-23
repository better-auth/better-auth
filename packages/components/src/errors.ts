// import { BetterAuthError } from "@better-auth/core/error";
import { BetterAuthError } from "../../core/src/error";

/**
 * Base class for component errors
 */
export class BetterAuthComponentError extends BetterAuthError {}

export class BetterAuthComponentMissingConfigError extends BetterAuthComponentError {
	constructor(message: string) {
		super(message, "Missing config");
	}
}

export class BetterAuthComponentMissingContextError extends BetterAuthComponentError {
	constructor(message: string) {
		super(message, "Missing context");
	}
}
