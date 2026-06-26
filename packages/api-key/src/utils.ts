import { APIError } from "@better-auth/core/error";
import { APIError as BaseAPIError } from "better-auth/api";

export const getDate = (span: number, unit: "sec" | "ms" = "ms") => {
	return new Date(Date.now() + (unit === "sec" ? span * 1000 : span));
};

export function isAPIError(error: unknown): error is APIError {
	return (
		error instanceof BaseAPIError ||
		error instanceof APIError ||
		(error as any)?.name === "APIError"
	);
}
