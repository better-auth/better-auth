import type { PluginSchema } from "../../types";

export const schema = {
	oauthClient: {
		modelName: "oauthClient",
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
			},
			redirectURLs: {
				type: "string",
			},
			type: {
				type: "string",
			},
			authenticationScheme: {
				type: "string",
			},
			disabled: {
				type: "boolean",
				required: false,
				defaultValue: false,
			},
			userId: {
				type: "string",
				references: {
					model: "user",
					field: "id",
				},
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
			},
			userId: {
				type: "string",
				references: {
					model: "user",
					field: "id",
				},
			},
			scopes: {
				type: "string",
			},
		},
	},
} satisfies PluginSchema;
