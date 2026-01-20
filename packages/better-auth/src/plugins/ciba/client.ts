import type { BetterAuthClientPlugin } from "@better-auth/core";

/**
 * CIBA Client Plugin
 *
 * Provides client methods for the CIBA (Client-Initiated Backchannel Authentication) flow.
 *
 * Agent flow:
 * 1. Agent calls bcAuthorize to initiate request
 * 2. User receives notification (push, email, etc.)
 * 3. User opens approval page, authenticates, and calls authorize
 * 4. Agent polls cibaToken until approved
 *
 * @example
 * ```ts
 * // Agent initiates request
 * const { auth_req_id, interval } = await authClient.ciba.bcAuthorize({
 *   client_id: "agent_123",
 *   client_secret: "secret",
 *   login_hint: "user@example.com",
 *   scope: "read:data",
 *   binding_message: "Approve access for weekly report",
 * });
 *
 * // Agent polls for token
 * let token;
 * while (!token) {
 *   await sleep(interval * 1000);
 *   try {
 *     const result = await authClient.ciba.cibaToken({
 *       grant_type: "urn:openid:params:grant-type:ciba",
 *       auth_req_id,
 *       client_id: "agent_123",
 *       client_secret: "secret",
 *     });
 *     token = result.access_token;
 *   } catch (e) {
 *     if (e.error === "authorization_pending") continue;
 *     if (e.error === "slow_down") { interval *= 2; continue; }
 *     throw e;
 *   }
 * }
 * ```
 *
 * User approval flow (in approval UI):
 * ```ts
 * // Get request details
 * const details = await authClient.ciba.cibaVerify({
 *   auth_req_id: "abc123",
 * });
 * // Display: "Agent {details.clientName} wants access to: {details.scope}"
 *
 * // User approves (must be authenticated)
 * await authClient.ciba.authorize({ authReqId: "abc123" });
 *
 * // Or user denies (no auth needed)
 * await authClient.ciba.deny({ authReqId: "abc123" });
 * ```
 */
export const cibaClient = () => {
	return {
		id: "ciba",
		$InferServerPlugin: {} as ReturnType<typeof import("./index").ciba>,
		pathMethods: {
			// Agent-facing endpoints
			"/oauth/bc-authorize": "POST",
			"/oauth/ciba-token": "POST",
			// Internal endpoints for approval UI
			"/ciba/verify": "GET",
			"/ciba/authorize": "POST",
			"/ciba/deny": "POST",
		},
	} satisfies BetterAuthClientPlugin;
};
