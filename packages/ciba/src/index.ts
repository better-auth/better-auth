import { BetterAuthError } from "@better-auth/core/error";
import type { OAuthProviderExtension } from "@better-auth/oauth-provider";
import type { BetterAuthPlugin } from "better-auth/types";
import { createCibaAuthorize, createCibaReject } from "./approval";
import { createBcAuthorize } from "./bc-authorize";
import { CIBA_ERROR_CODES } from "./error-codes";
import { createCibaGrantHandler } from "./grant-handler";
import { schema } from "./schema";
import type { CibaOptions } from "./types";
import { createCibaVerify } from "./verify";

export { deliverPing } from "./push";
export type { CibaOptions, SendNotificationData } from "./types";

const CIBA_GRANT_TYPE = "urn:openid:params:grant-type:ciba";

/**
 * Client Initiated Backchannel Authentication (CIBA) plugin for better-auth.
 *
 * Enables AI agents and other clients to request user authorization
 * out-of-band — the agent initiates a request, the user approves on
 * a separate device/channel.
 *
 * Requires the `oauth-provider` and `jwt` plugins.
 *
 * @see https://openid.net/specs/openid-client-initiated-backchannel-authentication-core-1_0.html
 */
export const ciba = (options: CibaOptions) => {
	const deliveryModes = options.deliveryModes ?? ["poll"];

	return {
		id: "ciba",
		schema,

		init(ctx) {
			const oauthPlugin = ctx.getPlugin("oauth-provider");
			if (!oauthPlugin) {
				throw new BetterAuthError(
					"The CIBA plugin requires the oauth-provider plugin",
				);
			}
		},

		extensions: {
			"oauth-provider": {
				grantTypes: {
					[CIBA_GRANT_TYPE]: createCibaGrantHandler(options),
				},
				grantTypeURIs: [CIBA_GRANT_TYPE],
				metadata: ({ baseURL }) => ({
					backchannel_authentication_endpoint: `${baseURL}/oauth2/bc-authorize`,
					backchannel_token_delivery_modes_supported: deliveryModes,
					backchannel_user_code_parameter_supported: false,
				}),
			} satisfies OAuthProviderExtension,
		},

		endpoints: {
			bcAuthorize: createBcAuthorize(options),
			cibaVerify: createCibaVerify(),
			cibaAuthorize: createCibaAuthorize(options),
			cibaReject: createCibaReject(),
		},

		$ERROR_CODES: CIBA_ERROR_CODES,
	} satisfies BetterAuthPlugin;
};
