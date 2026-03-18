import { APIError, createAuthMiddleware } from "better-auth/api";
import type { OAuthOptions, Scope } from "../types";
import { verifyOAuthQueryParams } from "../utils";

export const publicSessionMiddleware = (opts: OAuthOptions<Scope[]>) =>
	createAuthMiddleware(async (ctx) => {
		if (!opts.allowPublicClientPrelogin) {
			throw new APIError("BAD_REQUEST");
		}
		const query = ctx.body.oauth_query;
		const isValid = await verifyOAuthQueryParams(query, ctx.context.secret);
		if (!isValid) {
			throw new APIError("UNAUTHORIZED", {
				error: "invalid_signature",
			});
		}
	});
