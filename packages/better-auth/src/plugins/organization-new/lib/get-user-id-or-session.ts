import type { GenericEndpointContext } from "@better-auth/core";
import { BASE_ERROR_CODES } from "@better-auth/core/error";
import { APIError, getSessionFromCtx } from "../../../api";

/**
 *
 * This helper function is used to get user data with server/client environments as consideration.
 *
 * If called from the client, the request must include details of the user session. (i.e. session cookie)
 * If called from the server, the request body must include the `userId` field that is valid.
 *
 * @param ctx - The endpoint context object.
 * @returns The user data.
 */
export const getUserWithUserIdOrSession = async (
	ctx: GenericEndpointContext,
) => {
	const session = await getSessionFromCtx(ctx);
	if (session?.user) return session.user;
	if (!ctx.body.userId) throw APIError.fromStatus("UNAUTHORIZED");
	const user = await ctx.context.internalAdapter.findUserById(ctx.body.userId);
	if (!user) {
		throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.USER_NOT_FOUND);
	}
	return user;
};
