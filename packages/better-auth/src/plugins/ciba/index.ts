import type {
	BetterAuthPlugin,
	GenericEndpointContext,
} from "@better-auth/core";
import * as z from "zod";
import type { User } from "../../types";
import type { TimeString } from "../../utils/time";
import { ms } from "../../utils/time";
import { CIBA_ERROR_CODES } from "./error-codes";
import { bcAuthorize, cibaAuthorize, cibaReject, cibaVerify } from "./routes";
import { createCibaTokenHandler } from "./token-handler";
import type { CibaInternalOptions, CibaNotificationData } from "./types";

declare module "@better-auth/core" {
	// biome-ignore lint/correctness/noUnusedVariables: AuthOptions and Options need to be same as declared in the module
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		ciba: {
			creator: typeof ciba;
		};
	}
}

const timeStringSchema = z.custom<TimeString>(
	(val) => {
		if (typeof val !== "string") return false;
		try {
			ms(val as TimeString);
			return true;
		} catch {
			return false;
		}
	},
	{
		message:
			"Invalid time string format. Use formats like '30m', '5s', '1h', etc.",
	},
);

export const cibaOptionsSchema = z.object({
	sendNotification: z
		.custom<(data: CibaNotificationData, request?: Request) => Promise<void>>(
			(val) => typeof val === "function",
			{
				message:
					"sendNotification must be a function that returns a Promise<void>",
			},
		)
		.describe(
			"Callback to send notification to user. The implementer decides how to notify (email, SMS, push, etc.)",
		),
	requestLifetime: timeStringSchema
		.optional()
		.default("5m")
		.describe(
			"How long the CIBA request is valid. Use formats like '5m', '30s', '1h', etc.",
		),
	pollingInterval: timeStringSchema
		.optional()
		.default("5s")
		.describe(
			"Minimum polling interval for agents. Use formats like '5s', '10s', etc.",
		),
	approvalUri: z
		.string()
		.optional()
		.default("/ciba/approve")
		.describe(
			"The URI where users approve/deny the request. Can be absolute URL or relative path. The auth_req_id will be appended as a query parameter.",
		),
	resolveUser: z
		.custom<
			(loginHint: string, ctx: GenericEndpointContext) => Promise<User | null>
		>((val) => typeof val === "function" || val === undefined, {
			message:
				"resolveUser must be a function that returns Promise<User | null>",
		})
		.optional()
		.describe(
			"Custom function to resolve user from login_hint. By default, searches by email, then phone, then username.",
		),
});

/** Input options for CIBA plugin (before defaults applied) */
export type CibaOptions = z.input<typeof cibaOptionsSchema>;

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
	const opts = cibaOptionsSchema.parse(options);

	const internalOpts: CibaInternalOptions = {
		sendNotification: opts.sendNotification,
		requestLifetime: opts.requestLifetime,
		pollingInterval: opts.pollingInterval,
		approvalUri: opts.approvalUri,
		resolveUser: opts.resolveUser,
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
			bcAuthorize: bcAuthorize(internalOpts),
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

export type {
	BcAuthorizeResponse,
	CibaNotificationData,
	CibaTokenPendingError,
} from "./types";
