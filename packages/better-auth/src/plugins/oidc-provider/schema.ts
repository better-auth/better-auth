import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";

export const schema = {
	oauthApplication: {
		modelName: "oauthApplication",
		fields: {
			name: {
				type: "string",
			},
			icon: {
				type: "string",
				required: false,
			},
			metadata: {
				type: "string",
				required: false,
			},
			clientId: {
				type: "string",
				unique: true,
			},
			clientSecret: {
				type: "string",
				required: false,
			},
			redirectUrls: {
				type: "string",
			},
			type: {
				type: "string",
			},
			disabled: {
				type: "boolean",
				required: false,
				defaultValue: false,
			},
			userId: {
				type: "string",
				required: false,
				references: {
					model: "user",
					field: "id",
					onDelete: "cascade",
				},
				index: true,
			},
			createdAt: {
				type: "date",
			},
			updatedAt: {
				type: "date",
			},
		},
	},
	oauthAccessToken: {
		modelName: "oauthAccessToken",
		fields: {
			accessToken: {
				type: "string",
				unique: true,
			},
			refreshToken: {
				type: "string",
				unique: true,
			},
			accessTokenExpiresAt: {
				type: "date",
			},
			refreshTokenExpiresAt: {
				type: "date",
			},
			clientId: {
				type: "string",
				references: {
					model: "oauthApplication",
					field: "clientId",
					onDelete: "cascade",
				},
				index: true,
			},
			userId: {
				type: "string",
				required: false,
				references: {
					model: "user",
					field: "id",
					onDelete: "cascade",
				},
				index: true,
			},
			scopes: {
				type: "string",
			},
			createdAt: {
				type: "date",
			},
			updatedAt: {
				type: "date",
			},
		},
	},
	oauthConsent: {
		modelName: "oauthConsent",
		fields: {
			clientId: {
				type: "string",
				references: {
					model: "oauthApplication",
					field: "clientId",
					onDelete: "cascade",
				},
				index: true,
			},
			userId: {
				type: "string",
				references: {
					model: "user",
					field: "id",
					onDelete: "cascade",
				},
				index: true,
			},
			scopes: {
				type: "string",
			},
			createdAt: {
				type: "date",
			},
			updatedAt: {
				type: "date",
			},
			consentGiven: {
				type: "boolean",
			},
		},
	},
} satisfies BetterAuthPluginDBSchema;
