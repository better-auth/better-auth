import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";
import * as z from "zod";

export const schema = {
	tokenVault: {
		fields: {
			userId: {
				type: "string",
				required: true,
				references: {
					model: "user",
					field: "id",
					onDelete: "cascade",
				},
			},
			agentId: {
				type: "string",
				required: true,
			},
			provider: {
				type: "string",
				required: true,
			},
			accessToken: {
				type: "string",
				required: false,
				returned: false,
			},
			refreshToken: {
				type: "string",
				required: false,
				returned: false,
			},
			idToken: {
				type: "string",
				required: false,
				returned: false,
			},
			scopes: {
				type: "string",
				required: true,
			},
			accessTokenExpiresAt: {
				type: "date",
				required: false,
			},
			refreshTokenExpiresAt: {
				type: "date",
				required: false,
			},
			metadata: {
				type: "string",
				required: false,
			},
			lastUsedAt: {
				type: "date",
				required: false,
			},
			revokedAt: {
				type: "date",
				required: false,
			},
		},
	},
} satisfies BetterAuthPluginDBSchema;

export const tokenVaultGrantSchema = z.object({
	id: z.string(),
	userId: z.string(),
	agentId: z.string(),
	provider: z.string(),
	accessToken: z.string().optional(),
	refreshToken: z.string().optional(),
	idToken: z.string().optional(),
	scopes: z.string(),
	accessTokenExpiresAt: z.date().optional(),
	refreshTokenExpiresAt: z.date().optional(),
	metadata: z.string().optional(),
	createdAt: z.date(),
	updatedAt: z.date(),
	lastUsedAt: z.date().optional(),
	revokedAt: z.date().optional(),
});

export type TokenVaultGrant = z.infer<typeof tokenVaultGrantSchema>;
