import type { BetterAuthOptions } from "../../types";
import type { Awaitable } from "../../types/helper";
import { type JWTPayload } from "jose";
import { APIError } from "better-call";
import { verifyAccessToken } from "./verify";
import type { betterAuth } from "../../auth";
import { logger } from "@better-auth/core/env";

/**
 * A request middleware handler that checks and responds with
 * a WWW-Authenticate header for unauthenticated responses.
 *
 * Passes through authenticated tokens.
 * Provides valid Jwt payloads on `req.context.jwt`.
 *
 * @external
 */
export const mcpHandler = <
	Auth extends typeof betterAuth & {
		api: {
			oauth2IntrospectVerify: (...args: any) => Promise<JWTPayload | null>;
		};
		baseURL: string;
		options: BetterAuthOptions;
	},
	Request extends {
		readonly url: string;
		readonly headers: Headers;
		context?: {
			jwt?: JWTPayload;
		};
	},
>(
	auth: Auth,
	/** Resource is the same url as the audience */
	resource: string,
	handler: (req: Request) => Awaitable<Response>,
	opts?: Parameters<typeof verifyAccessToken>[1],
) => {
	return async (req: Request) => {
		const authorization = req.headers?.get("authorization") ?? undefined;
		const accessToken = authorization?.startsWith("Bearer ")
			? authorization.replace("Bearer ", "")
			: authorization;
		try {
			const token = await auth.api.oauth2IntrospectVerify({
				body: {
					token: accessToken,
					verifyOpts: opts,
				},
			});
			if (!req.context) req.context = {};
			req.context.jwt = token ?? undefined;
		} catch (error) {
			try {
				return handleMcpErrors(error, resource);
			} catch (err) {
				logger.error(err as unknown as string);
				if (err instanceof Error) throw err;
				throw new Error(String(err));
			}
		}
		return handler(req);
	};
};

/**
 * The following handles all MCP errors and API errors
 *
 * @external
 */
export function handleMcpErrors(error: unknown, resource: string | URL) {
	if (error instanceof APIError && error.status === "UNAUTHORIZED") {
		const _resource =
			typeof resource === "string" ? new URL(resource) : resource;
		let audiencePath = _resource.pathname + _resource.search;
		if (audiencePath.endsWith("/")) audiencePath = audiencePath.slice(0, -1);

		const wwwAuthenticateValue = `Bearer resource_metadata="${_resource.origin}/.well-known/oauth-protected-resource${
			audiencePath
		}"`;
		return new Response(error.message, {
			status: 401,
			headers: {
				"Content-Type": "application/json",
				"WWW-Authenticate": wwwAuthenticateValue,
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
