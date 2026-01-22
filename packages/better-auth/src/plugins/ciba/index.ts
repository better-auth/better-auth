import type { BetterAuthPlugin } from "@better-auth/core";
import { CIBA_ERROR_CODES } from "./error-codes";
import { bcAuthorize, cibaAuthorize, cibaReject, cibaVerify } from "./routes";
import { createCibaTokenHandler } from "./token-handler";
import type { CibaInternalOptions, CibaOptions } from "./types";

declare module "@better-auth/core" {
	// biome-ignore lint/correctness/noUnusedVariables: Auth and Context need to be same as declared in the module
	interface BetterAuthPluginRegistry<Auth, Context> {
		ciba: {
			creator: typeof ciba;
		};
	}
}

const DEFAULT_REQUEST_LIFETIME = "5m";
const DEFAULT_POLLING_INTERVAL = "5s";
const DEFAULT_APPROVAL_URI = "/ciba/approve";

/**
 * Client-Initiated Backchannel Authentication (CIBA) plugin
 *
 * CIBA allows an agent/client to initiate authentication on behalf of a user
 * who is notified out-of-band (email, SMS, push) and approves/denies the request.
 *
 * Requires: oidcProvider plugin
 *
 * @see https://openid.net/specs/openid-client-initiated-backchannel-authentication-core-1_0.html
 */
export const ciba = (options: CibaOptions) => {
	const opts: CibaInternalOptions = {
		sendNotification: options.sendNotification,
		requestLifetime: options.requestLifetime ?? DEFAULT_REQUEST_LIFETIME,
		pollingInterval: options.pollingInterval ?? DEFAULT_POLLING_INTERVAL,
		approvalUri: options.approvalUri ?? DEFAULT_APPROVAL_URI,
		resolveUser: options.resolveUser,
	};

	return {
		id: "ciba",
		init(ctx) {
			const oidcPlugin = ctx.getPlugin("oidc-provider");
			if (!oidcPlugin) {
				ctx.logger.error(
					"CIBA plugin requires oidcProvider plugin. Please add oidcProvider to your plugins.",
				);
			}
		},
		endpoints: {
			bcAuthorize: bcAuthorize(opts),
			cibaVerify,
			cibaAuthorize,
			cibaReject,
		},
		hooks: {
			before: [createCibaTokenHandler()],
		},
		$ERROR_CODES: CIBA_ERROR_CODES,
		options,
	} satisfies BetterAuthPlugin;
};

export type { CibaNotificationData, CibaOptions } from "./types";
