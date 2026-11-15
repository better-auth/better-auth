import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";

export const schema = {
	/**
	 * An `auth_session` (draft-ietf-oauth-first-party-apps §5.3.1): the state
	 * that ties a first-party app's requests to one sign-in, bound to the client
	 * and the DPoP key that started it.
	 */
	firstPartyAuthSession: {
		fields: {
			/** SHA-256 of the handle. The handle itself is never stored. */
			handleHash: { type: "string", unique: true, required: true },
			clientId: { type: "string", required: true, index: true },
			userId: { type: "string", required: false, index: true },
			/**
			 * The sign-in session behind an `authenticated` or `step_up` handle.
			 * Not a foreign key, because sessions can live in secondary storage;
			 * every lookup checks it is still live.
			 */
			sessionId: { type: "string", required: false, index: true },
			/** Whether this handle created the session, and may delete it. */
			ownsSession: { type: "boolean", required: true, defaultValue: false },
			/** The DPoP key thumbprint every request must prove (RFC 9449). */
			dpopJkt: { type: "string", required: false },
			state: { type: "string", required: true },
			/** The validated authorization request, as JSON. */
			query: { type: "string", required: true },
			/** Methods verified so far, as a JSON array. */
			amr: { type: "string", required: false },
			/** The pending strategy challenge, as JSON. */
			challenge: { type: "string", required: false },
			/** The `acr_values` a `step_up` handle requires. */
			acrValues: { type: "string", required: false },
			failures: { type: "number", required: true, defaultValue: 0 },
			expiresAt: { type: "date", required: true },
			createdAt: { type: "date", required: true },
			updatedAt: { type: "date", required: true },
		},
	},
	/**
	 * A failure counter for one account and method, or one client, over a
	 * fixed window.
	 */
	firstPartyAuthFailure: {
		fields: {
			/** HMAC of the account or client and the method. */
			key: { type: "string", unique: true, required: true },
			count: { type: "number", required: true },
			resetAt: { type: "date", required: true },
		},
	},
} satisfies BetterAuthPluginDBSchema;

export interface FirstPartyAuthSessionRow {
	id: string;
	handleHash: string;
	clientId: string;
	userId?: string | null;
	sessionId?: string | null;
	ownsSession: boolean;
	dpopJkt?: string | null;
	state: string;
	query: string;
	amr?: string | null;
	challenge?: string | null;
	acrValues?: string | null;
	failures: number;
	expiresAt: Date;
	createdAt: Date;
	updatedAt: Date;
}

export interface FirstPartyAuthFailureRow {
	id: string;
	key: string;
	count: number;
	resetAt: Date;
}
