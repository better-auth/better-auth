import { BetterAuthError } from "@better-auth/shared/error";

export class BetterAuthClientError extends BetterAuthError {
	description?: string;
	constructor(message: string, description?: string) {
		super(message);
		this.name = "ClientError";
		this.description = description;
	}
}
