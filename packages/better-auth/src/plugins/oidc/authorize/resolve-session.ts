import type { GenericEndpointContext } from "../../../types";
import type { ResolvedOIDCOptions } from "../utils/resolve-oidc-options";

import { makeRedirectHandler } from "../utils/redirect";
import { APIError, getSessionFromCtx } from "../../../api";

export async function resolveSession(
	ctx: GenericEndpointContext,
	options: ResolvedOIDCOptions,
) {
	const handleRedirect = makeRedirectHandler(ctx);

	// Ensure request exists
	if (!ctx.request) {
		throw new APIError("UNAUTHORIZED", {
			error_description: "request not found",
			error: "invalid_request",
		});
	}

	// Ensure session
	const session = await getSessionFromCtx(ctx);
	if (!session) {
		await ctx.setSignedCookie(
			"oidc_login_prompt",
			JSON.stringify(ctx.query),
			ctx.context.secret,
			{ maxAge: 600, path: "/", sameSite: "lax" },
		);
		const queryFromURL = ctx.request?.url?.split("?")[1];
		throw handleRedirect(`${options.loginPage}?${queryFromURL}`);
	}

	return session;
}
