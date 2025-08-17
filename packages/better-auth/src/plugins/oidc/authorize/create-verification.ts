import type { Client } from "../types";
import type { ResolvedQuery } from "./resolve-query";
import type { GenericEndpointContext, Session } from "../../../types";
import type { ResolvedOIDCOptions } from "../utils/resolve-oidc-options";

import { formatErrorURL } from "../utils/errors";
import { generateRandomString } from "../../../crypto";
import { makeRedirectHandler } from "../utils/redirect";

export async function createVerification(
	ctx: GenericEndpointContext,
	options: ResolvedOIDCOptions,
	client: Client,
	query: ResolvedQuery,
	session: Session,
) {
	try {
		return await ctx.context.internalAdapter.createVerificationValue(
			{
				value: JSON.stringify({
					userId: session.userId,
					clientId: client.clientId,
					redirectURI: query.redirectURI,
					scope: query.scope,
					authTime: new Date(session.createdAt).getTime(),
					requireConsent: query.prompt === "consent",
					state: query.prompt === "consent" ? query.state : null,
					codeChallenge: query.codeChallenge.challenge,
					codeChallengeMethod: query.codeChallenge.method,
					nonce: query.nonce,
				}),
				identifier: generateRandomString(32, "a-z", "A-Z", "0-9"),
				expiresAt: new Date(Date.now() + options.codeExpiresIn * 1000),
			},
			ctx,
		);
	} catch {
		const handleRedirect = makeRedirectHandler(ctx);
		throw handleRedirect(
			formatErrorURL(
				query.redirectURI,
				"server_error",
				"Error processing request",
			),
		);
	}
}
