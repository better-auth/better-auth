import { APIError } from "better-call";

/**
 * The following handles all MCP errors and API errors
 */
export function handleMcpErrors(
	error: unknown,
	opts: {
		baseUrl: string;
		path?: string;
	},
) {
	if (error instanceof APIError && error.status === "UNAUTHORIZED") {
		let { baseUrl, path } = opts;
		if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
		if (path?.length && !path.startsWith("/")) path = "/" + path;
		if (path && path.endsWith("/")) path = path.slice(0, -1);

		const wwwAuthenticateValue = `Bearer resource_metadata="${baseUrl}/.well-known/oauth-authorization-server${
			path ? path : ""
		}"`;
		return new Response(error.message, {
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
