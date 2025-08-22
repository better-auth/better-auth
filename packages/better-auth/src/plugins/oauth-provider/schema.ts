import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";

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
			skipConsent: {
				type: "boolean",
				required: false,
			},
			scopes: {
				type: "string[]",
				required: false,
			},
			// Recommended client data
			userId: {
				type: "string",
				required: false,
				references: {
					model: "user",
					field: "id",
				},
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
				type: "string[]",
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
				type: "string[]",
				required: false,
			},
			tokenEndpointAuthMethod: {
				type: "string",
				required: false,
			},
			grantTypes: {
				type: "string[]",
				required: false,
			},
			responseTypes: {
				type: "string[]",
				required: false,
			},
			// RFC6749 Spec
			public: {
				type: "boolean",
				required: false,
			},
			type: {
				type: "string",
				required: false,
			},
			// All other metadata
			metadata: {
				type: "json",
				required: false,
			},
		},
	},
	/**
	 * An opaque refresh token created with "offline_access"
	 *
	 * Refresh tokens are linked to a session.
	 */
	oauthRefreshToken: {
		fields: {
			token: {
				type: "string",
				required: true,
			},
			clientId: {
				type: "string",
				required: true,
				references: {
					model: "oauthClient",
					field: "clientId",
				},
			},
			// Session used during authorization
			sessionId: {
				type: "string",
				required: false,
				references: {
					model: "session",
					field: "id",
					// session can be deleted but refresh still active
					onDelete: "set null",
				},
			},
			userId: {
				type: "string",
				required: true,
				references: {
					model: "user",
					field: "id",
				},
			},
			expiresAt: {
				type: "date",
			},
			createdAt: {
				type: "date",
			},
			// Immutable
			scopes: {
				type: "string[]",
				required: true,
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
				// Optional for client credentials grant
				required: false,
				// Not unique, multiple sessions could exist
				references: {
					model: "session",
					field: "id",
					// session can be deleted but refresh still active
					onDelete: "set null",
				},
			},
			userId: {
				type: "string",
				required: false,
				references: {
					model: "user",
					field: "id",
				},
			},
			refreshId: {
				type: "string",
				required: false,
				references: {
					model: "oauthRefreshToken",
					field: "id",
				},
			},
			expiresAt: {
				type: "date",
			},
			createdAt: {
				type: "date",
			},
			// Shall be same as refreshId.scopes if using refreshId
			scopes: {
				type: "string[]",
				required: true,
			},
		},
	},
	oauthConsent: {
		modelName: "oauthConsent",
		fields: {
			clientId: {
				type: "string",
				references: {
					model: "oauthClient",
					field: "clientId",
				},
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
