import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";

/**
 * Stores the DPoP key each Solid refresh token is bound to.
 *
 * RFC 9449 binds a refresh token issued to a public client to the key that
 * proved possession at the token endpoint, so the same key has to be replayed
 * on every refresh. It outlives the request that created it, which is why it is
 * persisted here — encrypted with the instance secret — rather than held in
 * memory, where a restart or a second serverless instance would lose it.
 *
 * A row is keyed by a hash of the refresh token it is bound to, never by the
 * token itself, and is rewritten to the new hash when the provider rotates the
 * token.
 *
 * @see https://www.rfc-editor.org/rfc/rfc9449.html#section-5
 */
export const schema = {
	solidDpopKey: {
		fields: {
			/** Provider ID the key belongs to, so two providers never collide. */
			providerId: {
				type: "string",
				required: true,
			},
			/** SHA-256 hex digest of the bound refresh token. */
			tokenHash: {
				type: "string",
				required: true,
			},
			/** RFC 7638 thumbprint of the public key, matching the token's `cnf.jkt`. */
			jkt: {
				type: "string",
				required: true,
			},
			/** JWS algorithm the proof is signed with. */
			algorithm: {
				type: "string",
				required: true,
			},
			/** Encrypted private JWK. */
			privateKey: {
				type: "string",
				required: true,
			},
			createdAt: {
				type: "date",
				required: true,
			},
			/** When the row becomes collectable, tracking the refresh token's life. */
			expiresAt: {
				type: "date",
				required: true,
			},
		},
		indexes: [
			{ fields: ["tokenHash"], unique: true },
			{ fields: ["expiresAt"] },
		],
	},
} satisfies BetterAuthPluginDBSchema;

export interface SolidDpopKeyRecord {
	id: string;
	providerId: string;
	tokenHash: string;
	jkt: string;
	algorithm: string;
	privateKey: string;
	createdAt: Date;
	expiresAt: Date;
}
