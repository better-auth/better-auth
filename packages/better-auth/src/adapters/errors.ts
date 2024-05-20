import { BetterAuthError } from "../errors";

export class AdapterError extends BetterAuthError {
	description?: string;
	constructor(message: string, description?: string) {
		super(message);
		this.name = "AdapterError";
		this.description = description;
	}
}
export class RecordExist extends AdapterError {
	constructor(message?: string, description?: string) {
		super(message ?? "Record already exist", description);
	}
}
