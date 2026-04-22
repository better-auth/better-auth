import { APIError as BaseAPIError } from "better-call";
import { APIError } from "../error/index.js";

export function isAPIError(error: unknown): error is APIError {
	return (
		error instanceof BaseAPIError ||
		error instanceof APIError ||
		(error as { name?: string })?.name === "APIError"
	);
}
