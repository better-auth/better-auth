import { APIError } from "@better-auth/core/error";
import { APIError as BaseAPIError } from "better-call";

export function isAPIError(error: unknown): error is APIError {
	return (
		error instanceof BaseAPIError ||
		error instanceof APIError ||
		(error as any)?.name === "APIError"
	);
}
