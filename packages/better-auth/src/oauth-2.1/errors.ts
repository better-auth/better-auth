import { APIError } from "better-call";
import { logger } from "../utils/logger";

/**
 * Error that should return a 401 unauthenticated response.
 * The error.message should be the www-authenticate header value
 */
export class McpUnauthenticatedError extends Error {
	constructor(message: string, baseUrl: string, path?: string) {
		if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
		if (path?.length && !path.startsWith("/")) path = "/" + path;
		if (path && path.endsWith("/")) path = path.slice(0, -1);
		const wwwAuthenticateValue = `Bearer resource_metadata="${baseUrl}/.well-known/oauth-authorization-server${
			path ? path : ""
		}"`;
		super(
			JSON.stringify({
				message,
				wwwAuthenticateValue,
			}),
		);
		this.name = "unauthenticated";
	}
}

/**
 * The following handles all MCP errors and API errors
 */
export function handleMcpErrors(error: unknown) {
	if (error instanceof McpUnauthenticatedError) {
		const { wwwAuthenticateValue, message } = JSON.parse(error.message);
		return new Response(message, {
			status: 401,
			headers: {
				"Content-Type": "application/text",
				"www-authenticate": wwwAuthenticateValue,
			},
		});
	} else if (error instanceof APIError) {
		return new Response(error.message, {
			status: error.statusCode,
			headers: error.headers,
		});
	} else if (error instanceof Error) {
		throw error;
	} else {
		throw new Error(error as unknown as string);
	}
}
