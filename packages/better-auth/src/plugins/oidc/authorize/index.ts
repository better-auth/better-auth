import type { MakeOIDCPlugin } from "../index";
import type { GenericEndpointContext } from "../../../types";
import type { ResolvedOIDCOptions } from "../utils/resolve-oidc-options";

import { resolveInputs } from "./resolve-inputs";
import { makeRedirectHandler } from "../utils/redirect";
import { handleConsentFlow } from "./handle-consent-flow";
import { createVerification } from "./create-verification";
import { setCORSHeaders } from "../utils/set-cors-headers";

export const makeAuthorize =
	(makePluginOpts: MakeOIDCPlugin) =>
	async (ctx: GenericEndpointContext, options: ResolvedOIDCOptions) => {
		if (makePluginOpts.disableCors) {
			setCORSHeaders(ctx);
		}

		const { session, client, query } = await resolveInputs(
			ctx,
			options,
			makePluginOpts,
		);
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
