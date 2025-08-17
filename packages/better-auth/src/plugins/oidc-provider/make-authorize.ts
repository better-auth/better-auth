import type { MakeOidcPlugin } from "./make-oidc-plugin";
import type { GenericEndpointContext } from "../../types";
import type { ResolvedOIDCOptions } from "./utils/resolve-oidc-options";

import { makeRedirectHandler } from "./utils/redirect";
import { resolveInputs } from "./authorize/resolve-inputs";
import { setCORSHeaders } from "./authorize/set-cors-headers";
import { handleConsentFlow } from "./authorize/handle-consent-flow";
import { createVerification } from "./authorize/create-verification";

export const makeAuthorize =
	(makePluginOpts: MakeOidcPlugin) =>
	async (ctx: GenericEndpointContext, options: ResolvedOIDCOptions) => {
		if (makePluginOpts.disableCorsInAuthorize) {
			setCORSHeaders(ctx);
		}

		const { session, client, query } = await resolveInputs(ctx, options);
		const verification = await createVerification(
			ctx,
			options,
			client,
			query,
			session.session,
		);

		const redirectURI = new URL(query.redirectURI);
		redirectURI.searchParams.set("code", verification.identifier);
		if (query.state) redirectURI.searchParams.set("state", query.state);

		if (
			makePluginOpts.alwaysSkipConsent ||
			query.prompt !== "consent" ||
			client.skipConsent
		) {
			const handleRedirect = makeRedirectHandler(ctx);
			throw handleRedirect(redirectURI.toString());
		}

		return handleConsentFlow(
			ctx,
			options,
			client,
			session.session,
			query,
			verification,
			redirectURI,
		);
	};
