import { BetterAuthError } from "../errors/index";

export class ClientError extends BetterAuthError {
	description?: string;
	constructor(message: string, description?: string) {
		super(message);
		this.name = "ClientError";
		this.description = description;
	}
}
