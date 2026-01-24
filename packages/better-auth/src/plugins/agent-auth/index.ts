import type { BetterAuthPlugin } from "@better-auth/core";
import { mergeSchema } from "../../db";
import { CIBA_ERROR_CODES } from "../ciba/error-codes";
import { bcAuthorize, cibaAuthorize, cibaReject, cibaVerify } from "../ciba/routes";
import { createCibaTokenHandler } from "../ciba/token-handler";
import type { CibaInternalOptions, CibaNotificationData } from "../ciba/types";
import { oidcProvider } from "../oidc-provider";
import { schema as oidcSchema } from "../oidc-provider/schema";
import type { AgentAuthOptions, AgentNotificationData } from "./types";

declare module "@better-auth/core" {
	// biome-ignore lint/correctness/noUnusedVariables: Auth and Context need to be same as declared in the module
	interface BetterAuthPluginRegistry<Auth, Context> {
		"agent-auth": {
			creator: typeof agentAuth;
		};
	}
}

const DEFAULT_REQUEST_LIFETIME = "5m";
const DEFAULT_POLLING_INTERVAL = "5s";
const DEFAULT_APPROVAL_URI = "/agent/approve";

/**
 * Agent Auth plugin - Simple authentication for AI agents
 *
 * Enables:
 * - Async Auth: Agent requests → User gets notification → User approves
 * - Delegation: Agent acts on behalf of user (coming soon)
 * - Token Storage: Store 3rd party tokens (coming soon)
 *
 * @example
 * ```ts
 * import { agentAuth } from "better-auth/plugins";
 *
 * export const auth = betterAuth({
 *   plugins: [
 *     agentAuth({
 *       sendNotification: async ({ user, approvalUrl }) => {
 *         await sendEmail(user.email, `Approve: ${approvalUrl}`);
 *       },
 *     })
 *   ]
 * });
 * ```
 */
export const agentAuth = (options: AgentAuthOptions) => {
	const {
		sendNotification,
		requestLifetime = DEFAULT_REQUEST_LIFETIME,
		pollingInterval = DEFAULT_POLLING_INTERVAL,
		approvalUri = DEFAULT_APPROVAL_URI,
		resolveUser,
		asyncAuth = true,
	} = options;

	// Create internal OIDC provider
	const internalOidc = oidcProvider({
		loginPage: "/sign-in",
	});

	// Adapt notification callback from friendly format to CIBA format
	const cibaNotification = async (
		data: CibaNotificationData,
		request?: Request,
	) => {
		const friendlyData: AgentNotificationData = {
			user: data.user,
			approvalUrl: data.approvalUrl,
			message: data.bindingMessage,
			clientId: data.clientId,
			scope: data.scope,
			expiresAt: data.expiresAt,
		};
		return sendNotification(friendlyData, request);
	};

	// CIBA internal options
	const cibaOpts: CibaInternalOptions = {
		sendNotification: cibaNotification,
		requestLifetime,
		pollingInterval,
		approvalUri,
		resolveUser,
	};

	return {
		id: "agent-auth",
		schema: mergeSchema(oidcSchema, {}),
		endpoints: {
			// OIDC endpoints
			...internalOidc.endpoints,
			// Async auth (CIBA) endpoints
			...(asyncAuth
				? {
						bcAuthorize: bcAuthorize(cibaOpts),
						cibaVerify,
						cibaAuthorize,
						cibaReject,
					}
				: {}),
		},
		hooks: {
			before: asyncAuth ? [createCibaTokenHandler()] : [],
			after: internalOidc.hooks?.after || [],
		},
		$ERROR_CODES: CIBA_ERROR_CODES,
		options,
	} satisfies BetterAuthPlugin;
};

export type { AgentAuthOptions, AgentNotificationData } from "./types";
