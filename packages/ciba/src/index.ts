import { extendOAuthProvider } from "@better-auth/oauth-provider";
import type { BetterAuthPlugin } from "better-auth";
import { createApprovalEndpoints } from "./approval";
import { createBcAuthorize } from "./bc-authorize";
import { BC_AUTHORIZE_PATH, CIBA_GRANT_TYPE } from "./constants";
import { CIBA_ERROR_CODES } from "./error-codes";
import { createCibaGrantHandler } from "./grant-handler";
import { getCibaSchema } from "./schema";
import type { CibaOptions } from "./types";
import {
	DELIVERY_MODE_FIELD,
	NOTIFICATION_ENDPOINT_FIELD,
	validateCibaClientMetadata,
} from "./utils";
import { PACKAGE_VERSION } from "./version";

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		ciba: {
			creator: typeof ciba;
		};
	}
}

/**
 * OpenID Connect Client-Initiated Backchannel Authentication (CIBA) for
 * `oauthProvider()`. A client starts a request at the backchannel endpoint, the
 * user approves on a separate device, and the client collects tokens at the
 * token endpoint, either by polling (`poll`) or after the server notifies it
 * (`ping`). Trusted server code can complete a request with
 * `auth.api.completeCibaRequest`.
 *
 * Requires the `oauth-provider` and `jwt` plugins.
 *
 * @see https://openid.net/specs/openid-client-initiated-backchannel-authentication-core-1_0.html
 */
export const ciba = (options: CibaOptions) => {
	const settings = {
		deliveryModes: options.deliveryModes ?? ["poll"],
		expiresIn: options.expiresIn ?? 300,
		interval: options.interval ?? 5,
	};
	return {
		id: "ciba",
		version: PACKAGE_VERSION,
		schema: getCibaSchema(options.schema),
		init(ctx) {
			extendOAuthProvider(ctx, {
				grants: { [CIBA_GRANT_TYPE]: createCibaGrantHandler(options) },
				clientMetadata: {
					fields: [DELIVERY_MODE_FIELD, NOTIFICATION_ENDPOINT_FIELD],
					validate: (input) =>
						validateCibaClientMetadata(input, settings.deliveryModes),
				},
				metadata: ({ ctx: endpointCtx }) => ({
					backchannel_authentication_endpoint: `${endpointCtx.context.baseURL}${BC_AUTHORIZE_PATH}`,
					backchannel_token_delivery_modes_supported: settings.deliveryModes,
					backchannel_user_code_parameter_supported: false,
					...(options.authorizationDetailsTypes?.length
						? {
								authorization_details_types_supported:
									options.authorizationDetailsTypes,
							}
						: {}),
				}),
			});
		},
		endpoints: {
			bcAuthorize: createBcAuthorize(options, settings),
			...createApprovalEndpoints(options),
		},
		// Each backchannel request notifies a user, so it gets a tighter limit
		// than the generic per-IP default.
		rateLimit: [
			{
				pathMatcher: (path: string) => path === BC_AUTHORIZE_PATH,
				window: 60,
				max: 10,
			},
		],
		$ERROR_CODES: CIBA_ERROR_CODES,
	} satisfies BetterAuthPlugin;
};

export { CIBA_GRANT_TYPE } from "./constants";
export { CIBA_ERROR_CODES } from "./error-codes";
export type {
	AuthorizationDetail,
	CibaDecision,
	CibaDeliveryMode,
	CibaOptions,
	CibaRequest,
	CibaRequestInput,
	SendNotificationData,
} from "./types";
