import type { OAuthProviderExtension } from "@better-auth/oauth-provider";
import { extendOAuthProvider } from "@better-auth/oauth-provider";
import type { BetterAuthPlugin } from "better-auth";
import { mergeSchema } from "better-auth/db";
import { cibaApprovalRequest } from "./approval";
import { createBcAuthorize } from "./bc-authorize";
import {
	APPROVAL_PARAMETER,
	BC_AUTHORIZE_PATH,
	CIBA_GRANT_TYPE,
} from "./constants";
import {
	DELIVERY_MODE_FIELD,
	NOTIFICATION_ENDPOINT_FIELD,
	resolveCibaDelivery,
} from "./delivery";
import { CIBA_ERROR_CODES } from "./error-codes";
import { createCibaGrantHandler } from "./grant-handler";
import { schema } from "./schema";
import type { CibaOptions, ResolvedCibaOptions } from "./types";
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
 * `oauthProvider()`, in poll mode. A client names a user with `login_hint` at
 * `/oauth2/bc-authorize`, the user approves on their own device through the
 * provider's sign-in and consent pages, and the client polls the token
 * endpoint for tokens.
 *
 * Requires the `oauth-provider` and `jwt` plugins.
 *
 * @see https://openid.net/specs/openid-client-initiated-backchannel-authentication-core-1_0.html
 */
export const ciba = (options: CibaOptions) => {
	const resolvedOptions: ResolvedCibaOptions = {
		...options,
		deliveryModes: options.deliveryModes ?? ["poll"],
		expiresIn: options.expiresIn ?? 300,
		interval: options.interval ?? 5,
	};
	const extension: OAuthProviderExtension = {
		grants: {
			[CIBA_GRANT_TYPE]: createCibaGrantHandler(resolvedOptions),
		},
		interactionRequests: {
			[APPROVAL_PARAMETER]: cibaApprovalRequest(options.resultPage),
		},
		clientMetadata: {
			// CIBA §4: clients register these through dynamic registration or a
			// client metadata document too; they are stored in `metadata`.
			fields: [DELIVERY_MODE_FIELD, NOTIFICATION_ENDPOINT_FIELD],
			validate: ({ client, metadata }) => {
				if (client.grant_types?.includes(CIBA_GRANT_TYPE)) {
					resolveCibaDelivery(metadata, resolvedOptions.deliveryModes);
				}
			},
		},
		metadata: ({ ctx }) => ({
			backchannel_authentication_endpoint: `${ctx.context.baseURL}${BC_AUTHORIZE_PATH}`,
			backchannel_token_delivery_modes_supported: resolvedOptions.deliveryModes,
			backchannel_user_code_parameter_supported: false,
		}),
	};
	return {
		id: "ciba",
		version: PACKAGE_VERSION,
		schema: mergeSchema(schema, options.schema),
		init(ctx) {
			extendOAuthProvider(ctx, extension);
		},
		endpoints: {
			bcAuthorize: createBcAuthorize(resolvedOptions),
		},
		// Each request notifies a user, so it gets a tighter limit than the
		// generic per-IP default.
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
export type { CibaDeliveryMode, CibaNotification, CibaOptions } from "./types";
