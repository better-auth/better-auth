import { extendOAuthProvider } from "@better-auth/oauth-provider";
import type { BetterAuthPlugin } from "better-auth";
import { createCibaAuthorize, createCibaReject } from "./approval";
import { createBcAuthorize } from "./bc-authorize";
import { BC_AUTHORIZE_PATH, CIBA_GRANT_TYPE } from "./constants";
import { CIBA_ERROR_CODES } from "./error-codes";
import { createCibaGrantHandler } from "./grant-handler";
import { createCibaGetRequest } from "./request";
import { schema } from "./schema";
import type { CibaOptions } from "./types";
import type { CibaDeliveryMode } from "./utils";
import { PACKAGE_VERSION } from "./version";

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		ciba: {
			creator: typeof ciba;
		};
	}
}

/**
 * Client-Initiated Backchannel Authentication (CIBA) plugin.
 *
 * Adds OpenID Connect decoupled authentication to an `oauth-provider` instance:
 * a client (an AI agent, CLI, or device) starts a request at the backchannel
 * endpoint, the user approves on a separate device, and tokens are delivered by
 * one of three modes (CIBA §4): `poll` (the client polls the token endpoint),
 * `ping` (the AS notifies the client to poll), or `push` (the AS delivers the
 * token set to the client). The deployment opts into modes via `deliveryModes`.
 *
 * Requires the `oauth-provider` and `jwt` plugins.
 *
 * @see https://openid.net/specs/openid-client-initiated-backchannel-authentication-core-1_0.html
 */
export const ciba = (options: CibaOptions) => {
	const deliveryModes: CibaDeliveryMode[] = options.deliveryModes ?? ["poll"];
	return {
		id: "ciba",
		version: PACKAGE_VERSION,
		schema,
		init(ctx) {
			extendOAuthProvider(ctx, {
				grants: { [CIBA_GRANT_TYPE]: createCibaGrantHandler(options) },
				metadata: ({ ctx: endpointCtx }) => ({
					backchannel_authentication_endpoint: `${endpointCtx.context.baseURL}${BC_AUTHORIZE_PATH}`,
					backchannel_token_delivery_modes_supported: deliveryModes,
					backchannel_user_code_parameter_supported: false,
				}),
				claims: {
					// `act.sub` (RFC 8693 §4.1) names the calling client as the actor
					// acting on the user's behalf, which is true only for tokens issued
					// through the CIBA grant. Emit it for that grant, and also when the
					// grant type is unknown (`undefined`) so opaque-token introspection,
					// which re-derives claims without a grant type, still reports the actor
					// on a CIBA token. A client registered for both `authorization_code`
					// and CIBA therefore keeps an `act`-free access token on its code flow;
					// only introspection of such a client's opaque tokens can over-attribute,
					// the unavoidable cost of re-derivation without per-token storage.
					accessToken: ({ client, grantType }) =>
						client.grantTypes?.includes(CIBA_GRANT_TYPE) &&
						(grantType === CIBA_GRANT_TYPE || grantType === undefined)
							? { act: { sub: client.clientId } }
							: {},
				},
			});
		},
		endpoints: {
			bcAuthorize: createBcAuthorize(options),
			cibaGetRequest: createCibaGetRequest(),
			cibaAuthorize: createCibaAuthorize(options),
			cibaReject: createCibaReject(options),
		},
		// The backchannel endpoint fires a user notification per request and the
		// request endpoint is unauthenticated, so both need tighter limits than the
		// generic per-IP default.
		rateLimit: [
			{
				pathMatcher: (path: string) => path === BC_AUTHORIZE_PATH,
				window: 60,
				max: 10,
			},
			{
				pathMatcher: (path: string) => path === "/ciba/request",
				window: 60,
				max: 30,
			},
		],
		$ERROR_CODES: CIBA_ERROR_CODES,
	} satisfies BetterAuthPlugin;
};

export { cibaClient } from "./client";
export { CIBA_GRANT_TYPE } from "./constants";
export { CIBA_ERROR_CODES } from "./error-codes";
export { deliverPing, deliverPush } from "./push";
export type { CibaOptions, SendNotificationData } from "./types";
export type { CibaDeliveryMode, CibaRequest } from "./utils";
