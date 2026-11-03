import { APIError, createAuthMiddleware } from "better-auth/api";
import type { OAuthOptions, Scope } from "../types";
import { checkOAuthQueryParams } from "../utils";

export const publicSessionMiddleware = (opts: OAuthOptions<Scope[]>) =>
	createAuthMiddleware(async (ctx) => {
		if (!opts.allowPublicClientPrelogin) {
			throw new APIError("BAD_REQUEST");
		}
		const query = ctx.body.oauth_query;
		const status = await checkOAuthQueryParams(query, ctx.context.secret);
		if (status !== "valid") {
			throw new APIError("UNAUTHORIZED", {
				error: status === "expired" ? "expired_request" : "invalid_signature",
			});
		}
	});
