import type { PluginSchema } from "../../types";

export const schema = {
	oauthApplication: {
		modelName: "oauth_application",
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
				fieldName: "client_id",
			},
			clientSecret: {
				type: "string",
				fieldName: "client_secret",
			},
			redirectURLs: {
				type: "string",
			},
			type: {
				type: "string",
			},
			authenticationScheme: {
				type: "string",
				fieldName: "authentication_scheme",
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
				fieldName: "user_id",
				required: false,
			},
		},
	},
	oauthAccessToken: {
		modelName: "oauth_access_token",
		fields: {
			accessToken: {
				type: "string",
				unique: true,
				fieldName: "access_token",
			},
			refreshToken: {
				type: "string",
				unique: true,
				fieldName: "refresh_token",
			},
			accessTokenExpiresAt: {
				type: "date",
				fieldName: "access_token_expires_at",
			},
			refreshTokenExpiresAt: {
				type: "date",
				fieldName: "refresh_token_expires_at",
			},
			clientId: {
				type: "string",
				fieldName: "client_id",
			},
			scopes: {
				type: "string",
			},
		},
	},
} satisfies PluginSchema;

export const modelName = {
	oauthApplication: "oauthApplication",
	oauthAccessToken: "oauthAccessToken",
};
