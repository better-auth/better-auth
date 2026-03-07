import { BetterAuthError } from "@better-auth/core/error";
import { createAuthMiddleware } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth/types";
import { createCibaAuthorize, createCibaReject } from "./approval";
import { createBcAuthorize } from "./bc-authorize";
import { CIBA_ERROR_CODES } from "./error-codes";
import { createCibaGrantHandler } from "./grant-handler";
import { schema } from "./schema";
import type { CibaOptions } from "./types";
import { createCibaVerify } from "./verify";

export type { CibaOptions } from "./types";

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

			const oauthOpts = oauthPlugin.options as { grantTypes?: string[] };
			if (
				oauthOpts.grantTypes &&
				!oauthOpts.grantTypes.includes(CIBA_GRANT_TYPE)
			) {
				oauthOpts.grantTypes.push(CIBA_GRANT_TYPE);
			}

			// Merge with any existing custom grant handlers (supports multiple plugins)
			const existing = (ctx as Record<string, unknown>)
				.customGrantTypeHandlers as Record<string, unknown> | undefined;

			return {
				context: {
					customGrantTypeHandlers: {
						...existing,
						[CIBA_GRANT_TYPE]: createCibaGrantHandler(options),
					},
				},
			};
		},

		endpoints: {
			bcAuthorize: createBcAuthorize(options),
			cibaVerify: createCibaVerify(),
			cibaAuthorize: createCibaAuthorize(options),
			cibaReject: createCibaReject(),
		},

		hooks: {
			after: [
				{
					// Enrich discovery metadata with CIBA fields
					matcher: (ctx) => {
						const path = ctx.path;
						return (
							path === "/get-open-id-config" ||
							path === "/get-o-auth-server-config" ||
							path === "/.well-known/openid-configuration" ||
							path === "/.well-known/oauth-authorization-server"
						);
					},
					handler: createAuthMiddleware(async (ctx) => {
						const body = (ctx as any).context?.returned as
							| Record<string, unknown>
							| undefined;
						if (!body || typeof body !== "object") return;

						const baseURL = (ctx.context as any).baseURL as string;

						body.backchannel_authentication_endpoint = `${baseURL}/oauth2/bc-authorize`;
						body.backchannel_token_delivery_modes_supported = deliveryModes;
						body.backchannel_user_code_parameter_supported = false;

						if (
							Array.isArray(body.grant_types_supported) &&
							!body.grant_types_supported.includes(CIBA_GRANT_TYPE)
						) {
							body.grant_types_supported.push(CIBA_GRANT_TYPE);
						}
					}),
				},
			],
		},

		$ERROR_CODES: CIBA_ERROR_CODES,
	} satisfies BetterAuthPlugin;
};
