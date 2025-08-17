import type {
	Session,
	Verification,
	GenericEndpointContext,
} from "../../../types";
import type { Client } from "../types";
import type { ResolvedQuery } from "./resolve-query";
import type { ResolvedOIDCOptions } from "../utils/resolve-oidc-options";

import { makeRedirectHandler } from "../utils/redirect";

export async function handleConsentFlow(
	ctx: GenericEndpointContext,
	options: ResolvedOIDCOptions,
	client: Client,
	session: Session,
	query: ResolvedQuery,
	verification: Verification,
	redirectURI: URL,
) {
	const handleRedirect = makeRedirectHandler(ctx);

	const hasAlreadyConsented = await ctx.context.adapter
		.findOne<{ consentGiven: boolean }>({
			model: "oauthConsent",
			where: [
				{ field: "clientId", value: client.clientId },
				{ field: "userId", value: session.userId },
			],
		})
		.then((res) => !!res?.consentGiven);

	if (hasAlreadyConsented) {
		throw handleRedirect(redirectURI.toString());
	}

	// Show consent page
	if (options.consentPage) {
		await ctx.setSignedCookie(
			"oidc_consent_prompt",
			verification.identifier,
			ctx.context.secret,
			{
				maxAge: 600,
				path: "/",
				sameSite: "lax",
			},
		);

		const params = new URLSearchParams({
			consent_code: verification.identifier,
			client_id: client.clientId,
			scope: query.scope.join(" "),
		});
		const consentURI = `${options.consentPage}?${params.toString()}`;

		throw handleRedirect(consentURI);
	}

	const htmlFn = options.getConsentHTML;

	return new Response(
		htmlFn({
			scopes: query.scope,
			clientMetadata: client.metadata,
			clientIcon: client.icon,
			clientId: client.clientId,
			clientName: client.name,
			code: verification.identifier,
		}),
		{ headers: { "content-type": "text/html" } },
	);
}
