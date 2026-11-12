import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";

export type DbscBinding = {
	id: string;
	tokenHash: string;
	userId: string;
	publicKey: string;
	algorithm: string;
	thumbprint: string;
	lastChallengeAt: number;
	expiresAt: Date;
	createdAt: Date;
	updatedAt: Date;
};

/**
 * One row per bound session. Kept out of the `session` row so a session
 * update can never overwrite DBSC state and silently unbind it. The session
 * is named by a hash of its token, which every request carries, so a binding
 * is found without loading the session first.
 */
export const schema = {
	dbscBinding: {
		fields: {
			tokenHash: {
				type: "string",
				required: true,
				unique: true,
			},
			userId: {
				type: "string",
				required: true,
				index: true,
				references: {
					model: "user",
					field: "id",
					onDelete: "cascade",
				},
			},
			publicKey: {
				type: "string",
				required: true,
			},
			algorithm: {
				type: "string",
				required: true,
			},
			thumbprint: {
				type: "string",
				required: true,
				unique: true,
			},
			lastChallengeAt: {
				type: "number",
				required: true,
				bigint: true,
			},
			expiresAt: {
				type: "date",
				required: true,
			},
			createdAt: {
				type: "date",
				required: true,
			},
			updatedAt: {
				type: "date",
				required: true,
			},
		},
	},
} satisfies BetterAuthPluginDBSchema;
