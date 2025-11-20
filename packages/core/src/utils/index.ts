import { APIError } from "better-call";

export { defineErrorCodes } from "./error-codes";

export function invariant(
	condition: boolean,
	message: string,
): asserts condition {
	if (!condition) {
		throw new APIError("PRECONDITION_FAILED", {
			message,
		});
	}
}
