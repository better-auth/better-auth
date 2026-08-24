import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";

export const refreshableSessionSchema = {
	refreshableSession: {
		fields: {
			tokenHash: {
				type: "string",
				required: true,
				unique: true,
				input: false,
			},
			familyId: {
				type: "string",
				required: true,
				index: true,
				input: false,
			},
			userId: {
				type: "string",
				required: true,
				index: true,
				input: false,
				references: {
					model: "user",
					field: "id",
					onDelete: "cascade",
				},
			},
			sessionId: {
				type: "string",
				required: false,
				index: true,
				input: false,
				references: {
					model: "session",
					field: "id",
					onDelete: "set null",
				},
			},
			clientId: {
				type: "string",
				required: false,
				index: true,
				input: false,
			},
			authTime: {
				type: "date",
				required: true,
				input: false,
			},
			expiresAt: {
				type: "date",
				required: true,
				index: true,
				input: false,
			},
			rotatedAt: {
				type: "date",
				required: false,
				input: false,
			},
			revokedAt: {
				type: "date",
				required: false,
				input: false,
			},
			replacementRefreshToken: {
				type: "string",
				required: false,
				input: false,
			},
			replacementSessionToken: {
				type: "string",
				required: false,
				input: false,
			},
			replacementExpiresAt: {
				type: "date",
				required: false,
				input: false,
			},
			createdAt: {
				type: "date",
				required: true,
				input: false,
			},
			updatedAt: {
				type: "date",
				required: true,
				input: false,
			},
		},
	},
} satisfies BetterAuthPluginDBSchema;
