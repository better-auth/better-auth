import type { AuthPluginSchema } from "../../types";

export const schema = {
	oauthClient: {
		modelName: "oauthClient",
		fields: {
			// Important Fields
			clientId: {
				type: "string",
				unique: true,
				required: true,
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
			redirectUris: {
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
	/**
	 * Uses the "session" schema to maintain user sessions
	 * and their optional refresh token.
	 */
	session: {
		fields: {
			token: {
				type: "string",
				// Optional because only available for refreshable Sessions
				required: false,
			},
			clientId: {
				type: "string",
				required: false,
				references: {
					model: "oauthClient",
					field: "clientId",
				},
			},
			scopes: {
				type: "string",
				required: false,
			},
		},
	},
	/**
	 * An opaque access token sent when there is no audience
	 * to assigned to the JWT.
	 * 
	 * Access tokens are linked to a session, better-auth
	 * authors SHALL always check for valid session!
	 * 
	 * AccessTokens SHALL only be created at refresh,
	 * destroyed at revoke, and read at introspection.
	 * NEVER update an access token! Typically a refresh and
	 * revoke (if not expired) may want to occur at the same time.
	 */
	oauthAccessToken: {
		modelName: "oauthAccessToken",
		fields: {
			token: {
				type: "string",
				unique: true,
			},
			clientId: {
				type: "string",
				required: true,
				references: {
					model: "oauthClient",
					field: "clientId",
				},
			},
			sessionId: {
				type: "string",
				required: false,
				// Optional for client credentials grant
				// Not unique, multiple sessions could exist
				references: {
					model: "session",
					field: "id",
				},
			},
			expiresAt: {
				type: "date",
			},
			createdAt: {
				type: "date",
			},
			// Shall be same as sessionId.scopes if using sessionId
			scope: {
				required: true,
				type: "string",
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
