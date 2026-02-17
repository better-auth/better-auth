import type { AgentSession } from "./types";

/**
 * Verify an agent JWT from an incoming request and log activity
 * with the actual business route path.
 *
 * Use this in **custom routes** that are not part of Better Auth's
 * own endpoint pipeline. For Better Auth endpoints, the plugin's
 * hooks handle validation and logging automatically.
 *
 * @example
 * ```ts
 * import { verifyAgentRequest } from "better-auth/plugins/agent-auth";
 *
 * // Next.js API route
 * export async function GET(request: Request) {
 *   const session = await verifyAgentRequest({ auth, request });
 *   if (!session) {
 *     return new Response("Unauthorized", { status: 401 });
 *   }
 *   // session.agent, session.user are available
 * }
 * ```
 */
export async function verifyAgentRequest(options: {
	/**
	 * The Better Auth instance (must have the agent-auth plugin).
	 * Accepts anything with an `api.getAgentSession` method.
	 */
	auth: {
		api: {
			getAgentSession: (opts: {
				headers: Headers;
			}) => Promise<AgentSession | null>;
		};
	};
	/** The incoming HTTP request from the custom route. */
	request: Request;
}): Promise<AgentSession | null> {
	const { auth, request } = options;

	// Forward original headers plus metadata about the actual route
	const headers = new Headers(request.headers);
	const url = new URL(request.url);
	headers.set("x-agent-method", request.method);
	headers.set("x-agent-path", url.pathname);

	return auth.api.getAgentSession({ headers });
}
