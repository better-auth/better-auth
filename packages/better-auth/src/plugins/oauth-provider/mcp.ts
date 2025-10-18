import type { Awaitable } from "../../types/helper";
import { type JWTPayload } from "jose";
import { APIError } from "better-call";
import { verifyAccessToken } from "./verify";

/**
 * A request middleware handler that checks and responds with
 * a WWW-Authenticate header for unauthenticated responses.
 *
 * @external
 */
export const mcpHandler = <
	Request extends {
		readonly url: string;
		readonly headers: Headers;
		context?: {
			jwt?: JWTPayload;
		};
	},
>(
	/** Resource is the same url as the audience */
	verifyOptions: Parameters<typeof verifyAccessToken>[1],
	handler: (req: Request, jwt: JWTPayload) => Awaitable<Response>,
	opts?: {
		/** Maps non-url (ie urn, client) resources to resource_metadata */
		resourceMetadataMappings: Record<string, string>;
	},
) => {
	return async (req: Request) => {
		const authorization = req.headers?.get("authorization") ?? undefined;
		const accessToken = authorization?.startsWith("Bearer ")
			? authorization.replace("Bearer ", "")
			: authorization;
		try {
			if (!accessToken?.length) {
				throw new APIError("UNAUTHORIZED", {
					message: "missing access token authorization header",
				});
			}
			const token = await verifyAccessToken(accessToken, verifyOptions);
			return handler(req, token);
		} catch (error) {
			try {
				handleMcpErrors(error, verifyOptions.verifyOptions.audience, opts);
			} catch (err) {
				if (err instanceof APIError) {
					return new Response(err.message, {
						...err,
						status: err.statusCode,
					});
				}
				throw new Error(String(err));
			}
			throw new Error(String(error));
		}
	};
};

/**
 * The following handles all MCP errors and API errors
 *
 * @internal
 */
export function handleMcpErrors(
	error: unknown,
	resource: string | string[],
	opts?: {
		/** Maps non-url (ie urn, client) resources to resource_metadata */
		resourceMetadataMappings?: Record<string, string>;
	},
) {
	if (error instanceof APIError && error.status === "UNAUTHORIZED") {
		const _resources = Array.isArray(resource) ? resource : [resource];
		const wwwAuthenticateValue = _resources
			.map((v) => {
				let audiencePath: string;
				if (URL.canParse?.(v)) {
					const url = new URL(v);
					audiencePath = url.pathname.endsWith("/")
						? url.pathname.slice(0, -1)
						: url.pathname;
					return `Bearer resource_metadata="${url.origin}/.well-known/oauth-protected-resource${
						audiencePath
					}"`;
				} else {
					const resourceMetadata = opts?.resourceMetadataMappings?.[v];
					if (!resourceMetadata) {
						throw new APIError("INTERNAL_SERVER_ERROR", {
							message: `missing resource_metadata mapping for ${v}`,
						});
					}
					return `Bearer resource_metadata=${resourceMetadata}`;
				}
			})
			.join(", ");
		throw new APIError(
			"UNAUTHORIZED",
			{
				message: error.message,
			},
			{
				"WWW-Authenticate": wwwAuthenticateValue,
			},
		);
	} else if (error instanceof Error) {
		throw error;
	} else {
		throw new Error(error as unknown as string);
	}
}
