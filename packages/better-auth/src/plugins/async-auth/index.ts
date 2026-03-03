import type {
	BetterAuthPlugin,
	GenericEndpointContext,
} from "@better-auth/core";
import * as z from "zod";
import type { User } from "../../types";
import type { TimeString } from "../../utils/time";
import { ms } from "../../utils/time";
import { ASYNC_AUTH_ERROR_CODES } from "./error-codes";
import {
	asyncAuthAuthorize,
	asyncAuthReject,
	asyncAuthVerify,
	bcAuthorize,
} from "./routes";
import { createAsyncAuthTokenHandler } from "./token-handler";
import type {
	AsyncAuthAgent,
	AsyncAuthInternalOptions,
	AsyncAuthNotificationData,
} from "./types";

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		"async-auth": {
			creator: typeof asyncAuth;
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

export const asyncAuthOptionsSchema = z
	.object({
		sendNotification: z
			.custom<
				(data: AsyncAuthNotificationData, request?: Request) => Promise<void>
			>((val) => typeof val === "function", {
				message:
					"sendNotification must be a function that returns a Promise<void>",
			})
			.optional()
			.describe(
				"Callback to send notification to user. The implementer decides how to notify (email, SMS, push, etc.)",
			),
		sendVerificationEmail: z
			.custom<
				(data: AsyncAuthNotificationData, request?: Request) => Promise<void>
			>((val) => typeof val === "function", {
				message:
					"sendVerificationEmail must be a function that returns a Promise<void>",
			})
			.optional()
			.describe(
				"Built-in email notification callback. Used as fallback when sendNotification is not provided.",
			),
		deliveryMode: z
			.enum(["poll", "push"])
			.optional()
			.default("poll")
			.describe(
				"Default delivery mode for async auth requests. Per-client override is supported via client metadata.",
			),
		requestLifetime: timeStringSchema
			.optional()
			.default("5m")
			.describe(
				"How long the async auth request is valid. Use formats like '5m', '30s', '1h', etc.",
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
			.default("/async-auth/approve")
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
		agents: z
			.custom<AsyncAuthAgent[]>(
				(val) =>
					val === undefined ||
					(Array.isArray(val) &&
						val.every(
							(a: unknown) =>
								typeof a === "object" &&
								a !== null &&
								"clientId" in a &&
								"clientSecret" in a,
						)),
				{ message: "agents must be an array of { clientId, clientSecret }" },
			)
			.optional()
			.describe(
				"Agent/client credentials for async auth. Define agents inline — no separate client registration needed.",
			),
	})
	.refine((data) => data.sendNotification || data.sendVerificationEmail, {
		message:
			"Either sendNotification or sendVerificationEmail must be provided",
		path: ["sendNotification"],
	});

/** Input options for async auth plugin (before defaults applied) */
export type AsyncAuthOptions = z.input<typeof asyncAuthOptionsSchema>;

/**
 * Async Auth plugin — backchannel authentication (CIBA) for AI agents and CLI tools
 *
 * Allows an agent/client to initiate authentication on behalf of a user
 * who is notified out-of-band (email, SMS, push) and approves/denies the request.
 *
 * Supports poll mode (default) and push mode (tokens delivered to client endpoint).
 *
 * Requires: oidcProvider plugin
 *
 * @see https://openid.net/specs/openid-client-initiated-backchannel-authentication-core-1_0.html
 */
export const asyncAuth = (options: AsyncAuthOptions) => {
	const opts = asyncAuthOptionsSchema.parse(options);

	// Build effective sendNotification: prefer sendNotification, fall back to sendVerificationEmail
	const effectiveSendNotification =
		opts.sendNotification ?? opts.sendVerificationEmail!;

	// Per-instance Set so multi-instance tests don't share state
	const ensuredAgents = new Set<string>();

	const internalOpts: AsyncAuthInternalOptions = {
		sendNotification: effectiveSendNotification,
		requestLifetime: opts.requestLifetime,
		pollingInterval: opts.pollingInterval,
		approvalUri: opts.approvalUri,
		resolveUser: opts.resolveUser,
		deliveryMode: opts.deliveryMode,
		agents: opts.agents ?? [],
		ensuredAgents,
	};

	return {
		id: "async-auth",
		init(ctx) {
			const oidcPlugin =
				ctx.getPlugin("oidc-provider") || ctx.getPlugin("oauth-provider");
			if (!oidcPlugin) {
				ctx.logger.error(
					'Async Auth plugin requires oidcProvider or oauthProvider plugin.\n\nAdd to your plugins:\n\n  import { oidcProvider, asyncAuth } from "better-auth/plugins";\n\n  plugins: [\n    oidcProvider({ loginPage: "/sign-in" }),\n    asyncAuth({ ... }),\n  ]',
				);
			}
		},
		endpoints: {
			bcAuthorize: bcAuthorize(internalOpts),
			asyncAuthVerify,
			asyncAuthAuthorize: asyncAuthAuthorize(internalOpts),
			asyncAuthReject,
		},
		hooks: {
			before: [createAsyncAuthTokenHandler(internalOpts)],
		},
		$ERROR_CODES: ASYNC_AUTH_ERROR_CODES,
		options,
	} satisfies BetterAuthPlugin;
};

export type {
	AsyncAuthAgent,
	AsyncAuthNotificationData,
	AsyncAuthPushTokenResponse,
	AsyncAuthTokenPendingError,
	BcAuthorizeResponse,
} from "./types";
