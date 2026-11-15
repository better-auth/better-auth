import type { OAuthBeforeTokenIssuanceInput } from "@better-auth/oauth-provider";
import { APIError } from "better-auth/api";
import type { AuthSessionRecord } from "./auth-session";
import { findAuthSessionForGrant, saveAuthSession } from "./auth-session";
import { isFirstPartyApp } from "./endpoint";
import { FIRST_PARTY_APPS_ERROR_CODES } from "./error-codes";
import type { ResolvedFirstPartyAppsOptions } from "./types";

function confirmationJkt(input: OAuthBeforeTokenIssuanceInput) {
	const confirmation = input.confirmation;
	return confirmation && "jkt" in confirmation ? confirmation.jkt : undefined;
}

/**
 * C3: refuses a first-party app's tokens when `requireStepUp` asks for
 * stronger authentication, with an `auth_session` for the authorization
 * challenge endpoint (draft §6.2). The handle reuses the grant's session
 * and one row per client, user, session, and DPoP key (C4).
 */
export function createStepUpCheck(options: ResolvedFirstPartyAppsOptions) {
	return async (input: OAuthBeforeTokenIssuanceInput) => {
		if (!options.requireStepUp || !input.user || !input.sessionId) return;
		if (!isFirstPartyApp(input.client)) return;
		const requirement = await options.requireStepUp(input);
		if (!requirement) return;
		const key = {
			clientId: input.client.clientId,
			userId: input.user.id,
			sessionId: input.sessionId,
			dpopJkt: confirmationJkt(input),
		};
		const existing = await findAuthSessionForGrant(input.ctx, key, ["step_up"]);
		const record: AuthSessionRecord = existing ?? {
			...key,
			ownsSession: false,
			state: "step_up" as const,
			query: {
				client_id: input.client.clientId,
				response_type: "code",
				scope: input.scopes.join(" "),
			} as AuthSessionRecord["query"],
			amr: [],
			failures: 0,
			expiresAt: new Date(),
		};
		record.acrValues = requirement.acrValues;
		record.challenge = undefined;
		record.failures = 0;
		record.expiresAt = new Date(
			Date.now() + options.authSession.expiresIn * 1000,
		);
		const handle = await saveAuthSession(input.ctx, record, { rotate: true });
		// §6.2: no challenge_type; the follow-up request decides how.
		throw new APIError("FORBIDDEN", {
			error: "insufficient_authorization",
			error_description: FIRST_PARTY_APPS_ERROR_CODES.STEP_UP_REQUIRED.message,
			auth_session: handle,
		});
	};
}

/**
 * §6.1: returns a fresh `auth_session` with the tokens for a code the
 * authorization challenge endpoint issued.
 */
export async function authSessionTokenResponse(
	input: OAuthBeforeTokenIssuanceInput,
): Promise<Record<string, unknown>> {
	if (
		input.grantType !== "authorization_code" ||
		!input.verificationValue ||
		!input.user ||
		!isFirstPartyApp(input.client)
	) {
		return {};
	}
	const record = await findAuthSessionForGrant(
		input.ctx,
		{
			clientId: input.client.clientId,
			userId: input.user.id,
			sessionId: input.verificationValue.sessionId,
			dpopJkt: confirmationJkt(input),
		},
		["authenticated"],
	);
	if (!record) return {};
	const handle = await saveAuthSession(input.ctx, record, { rotate: true });
	return { auth_session: handle };
}
