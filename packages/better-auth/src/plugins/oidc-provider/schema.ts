import type { AuthPluginSchema } from "../../types";

export const schema = {
	oauthApplication: {
		modelName: "oauthApplication",
		fields: {
			// Important Fields
			clientId: {
				type: "string",
				unique: true,
			},
			clientSecret: {
				type: "string",
				required: false,
			},
			disabled: {
				type: "boolean",
				defaultValue: false,
				required: false,
			},
			scope: {
				type: "string",
				required: false,
			},
			// Recommended client data
			userId: {
				type: "string",
				required: false,
			},
			createdAt: {
				type: "date",
				required: false,
			},
			updatedAt: {
				type: "date",
				required: false,
			},
			// UI Metadata
			name: {
				type: "string",
				required: false,
			},
			uri: {
				type: "string",
				required: false,
			},
			icon: {
				type: "string",
				required: false,
			},
			contacts: {
				type: "string",
				required: false,
			},
			tos: {
				type: "string",
				required: false,
			},
			policy: {
				type: "string",
				required: false,
			},
			// User Software Identifiers
			softwareId: {
				type: "string",
				required: false,
			},
			softwareVersion: {
				type: "string",
				required: false,
			},
			softwareStatement: {
				type: "string",
				required: false,
			},
			// Authentication Metadata
			redirectURLs: {
				type: "string",
				required: false,
			},
			tokenEndpointAuthMethod: {
				type: "string",
				required: false,
			},
			grantTypes: {
				type: "string",
				required: false,
			},
			responseTypes: {
				type: "string",
				required: false,
			},
			// RFC6749 Spec
			public: {
				type: "boolean",
				required: true,
			},
			type: {
				type: "string",
				required: false,
			},
			// All other metadata
			metadata: {
				type: "string",
				required: false,
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
			},
			userId: {
				type: "string",
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
