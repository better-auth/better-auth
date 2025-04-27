import type { AuthPluginSchema } from "../../types";

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
				shouldIndex: true,
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
			disabled: {
				type: "boolean",
				required: false,
				defaultValue: false,
			},
			userId: {
				type: "string",
				required: false,
				shouldIndex: true,
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
				shouldIndex: true,
			},
			refreshToken: {
				type: "string",
				unique: true,
				shouldIndex: true,
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
				required: false,
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
				shouldIndex: true,
			},
			userId: {
				type: "string",
				shouldIndex: true,
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
} satisfies AuthPluginSchema;
