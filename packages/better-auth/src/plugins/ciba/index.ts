import type { BetterAuthPlugin } from "@better-auth/core";
import { mergeSchema } from "../../db";
import { CIBA_ERROR_CODES } from "./error-codes";
import {
	createBcAuthorizeRoute,
	createCibaAuthorizeRoute,
	createCibaDenyRoute,
	createCibaTokenRoute,
	createCibaVerifyRoute,
} from "./routes";
import { schema } from "./schema";
import type { CIBAOptions } from "./types";

declare module "@better-auth/core" {
	// biome-ignore lint/correctness/noUnusedVariables: Auth and Context need to be same as declared in the module
	interface BetterAuthPluginRegistry<Auth, Context> {
		ciba: {
			creator: typeof ciba;
		};
	}
}

export { CIBA_ERROR_CODES } from "./error-codes";
export type {
	CIBANotificationRequest,
	CIBAOptions,
	CIBAUserHints,
} from "./types";
export { CIBA_GRANT_TYPE } from "./types";

/**
 * CIBA Plugin (Client-Initiated Backchannel Authentication)
 *
 * Enables agent-initiated authentication where users approve asynchronously.
 * The agent initiates the request, and the user receives a notification
 * to approve or deny without needing to be at a keyboard.
 *
 * Flow:
 * 1. Agent calls POST /oauth/bc-authorize with user hint
 * 2. User receives notification (push, email, SMS)
 * 3. User clicks approval link → lands on approval page
 * 4. User authenticates (using existing auth flow)
 * 5. User calls POST /ciba/authorize to approve
 * 6. Agent polls POST /oauth/ciba-token until approved
 * 7. Agent receives access token
 *
 * Endpoints:
 *
 * Agent-facing (public API):
 * - POST /oauth/bc-authorize - Initiate auth request
 * - POST /oauth/ciba-token - Poll for token
 *
 * Internal (for approval UI):
 * - GET /ciba/verify - Get request details (no auth)
 * - POST /ciba/authorize - Approve request (requires session)
 * - POST /ciba/deny - Deny request (no auth)
 *
 * Features:
 * - Agent-initiated authentication
 * - Async user approval via push/email/SMS
 * - Uses existing auth flow (MFA, passkey, etc.)
 * - Rate-limited polling
 * - Request expiration
 *
 * @example
 * ```ts
 * import { betterAuth } from "better-auth";
 * import { ciba } from "better-auth/plugins";
 *
 * const auth = betterAuth({
 *   plugins: [
 *     ciba({
 *       requestLifetime: "5m",
 *       pollingInterval: "5s",
 *       sendNotification: async (user, request) => {
 *         await sendPushNotification(user.deviceToken, {
 *           title: `${request.clientName} requests access`,
 *           body: request.bindingMessage || `Scopes: ${request.scope}`,
 *           data: { url: request.approveUrl },
 *         });
 *       },
 *     }),
 *   ],
 * });
 * ```
 */
/**
 * Internal options type with required fields filled in
 */
interface CIBAInternalOptions {
	requestLifetime: string;
	pollingInterval: string;
	sendNotification: CIBAOptions["sendNotification"];
	resolveUser?: CIBAOptions["resolveUser"];
	validateClient?: CIBAOptions["validateClient"];
	getClientName?: CIBAOptions["getClientName"];
	baseUrl?: CIBAOptions["baseUrl"];
	onApproved?: CIBAOptions["onApproved"];
	onDenied?: CIBAOptions["onDenied"];
	schema?: CIBAOptions["schema"];
}

export const ciba = (options: CIBAOptions) => {
	if (!options.sendNotification) {
		throw new Error("CIBA plugin requires sendNotification function");
	}

	const opts: CIBAInternalOptions = {
		requestLifetime: options.requestLifetime ?? "5m",
		pollingInterval: options.pollingInterval ?? "5s",
		sendNotification: options.sendNotification,
		resolveUser: options.resolveUser,
		validateClient: options.validateClient,
		getClientName: options.getClientName,
		baseUrl: options.baseUrl,
		onApproved: options.onApproved,
		onDenied: options.onDenied,
		schema: options.schema,
	};

	return {
		id: "ciba",
		schema: mergeSchema(schema, options.schema),
		endpoints: {
			// ================================================================
			// Agent-facing endpoints (public API)
			// ================================================================

			/**
			 * ### Endpoint
			 *
			 * POST `/oauth/bc-authorize`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.bcAuthorize`
			 *
			 * Initiate a CIBA authentication request.
			 * The agent calls this to request access on behalf of a user.
			 *
			 * Request body:
			 * - client_id: Agent identifier
			 * - client_secret: (optional) Agent secret
			 * - scope: Requested scopes
			 * - login_hint: User email or username
			 * - binding_message: Message to show to user
			 *
			 * Response:
			 * - auth_req_id: ID to use when polling
			 * - expires_in: Request lifetime in seconds
			 * - interval: Minimum polling interval in seconds
			 */
			bcAuthorize: createBcAuthorizeRoute(opts),

			/**
			 * ### Endpoint
			 *
			 * POST `/oauth/ciba-token`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.cibaToken`
			 *
			 * Poll for CIBA authentication result.
			 * Agent polls this until user approves/denies or request expires.
			 *
			 * Request body:
			 * - grant_type: "urn:openid:params:grant-type:ciba"
			 * - auth_req_id: ID from bc-authorize response
			 * - client_id: Agent identifier
			 *
			 * Response (if approved):
			 * - access_token: User's access token
			 * - token_type: "Bearer"
			 * - expires_in: Token lifetime
			 */
			cibaToken: createCibaTokenRoute(opts),

			// ================================================================
			// Internal endpoints (for approval UI)
			// Similar to device-authorization: /device, /device/approve, /device/deny
			// ================================================================

			/**
			 * ### Endpoint
			 *
			 * GET `/ciba/verify`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.cibaVerify`
			 *
			 * Get CIBA request details for the approval UI.
			 * Returns information about what the agent is requesting.
			 * No authentication required.
			 */
			cibaVerify: createCibaVerifyRoute(opts),

			/**
			 * ### Endpoint
			 *
			 * POST `/ciba/authorize`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.cibaAuthorize`
			 *
			 * **client:**
			 * `authClient.ciba.authorize`
			 *
			 * Approve a CIBA request. Requires authentication.
			 * User must be logged in using their normal auth method
			 * (password, MFA, passkey, etc.) before calling this.
			 *
			 * Similar to POST /device/approve in device-authorization.
			 */
			cibaAuthorize: createCibaAuthorizeRoute(opts),

			/**
			 * ### Endpoint
			 *
			 * POST `/ciba/deny`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.cibaDeny`
			 *
			 * **client:**
			 * `authClient.ciba.deny`
			 *
			 * Deny a CIBA request. Does not require authentication.
			 * Denial is safe without auth because it only prevents access.
			 *
			 * Similar to POST /device/deny in device-authorization.
			 */
			cibaDeny: createCibaDenyRoute(opts),
		},
		$ERROR_CODES: CIBA_ERROR_CODES,
		options,
	} satisfies BetterAuthPlugin;
};
