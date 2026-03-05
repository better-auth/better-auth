import { APIError } from "better-call";
import { GRAPH_ERROR_CODES } from "./error-codes";

/**
 * Require an active session on the endpoint context.
 * Throws UNAUTHORIZED if no session is present.
 */
export function requireSession(ctx: {
	context: { session: { user: { id: string } } | null };
}) {
	if (!ctx.context.session?.user) {
		throw new APIError("UNAUTHORIZED", {
			message: GRAPH_ERROR_CODES.UNAUTHORIZED,
		});
	}
	return ctx.context.session;
}
