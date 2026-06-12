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
			enableEndSession: {
				type: "boolean",
				required: false,
			},
			subjectType: {
				type: "string",
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
				index: true,
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
				required: true,
			},
			postLogoutRedirectUris: {
				type: "string[]",
				required: false,
			},
			backchannelLogoutUri: {
				type: "string",
				required: false,
			},
			backchannelLogoutSessionRequired: {
				type: "boolean",
				required: false,
			},
			tokenEndpointAuthMethod: {
				type: "string",
				required: false,
			},
			jwks: {
				type: "string",
				required: false,
			},
			jwksUri: {
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
			requirePKCE: {
				type: "boolean",
				required: false,
			},
			// All other metadata
			referenceId: {
				type: "string",
				required: false,
			},
			metadata: {
				type: "json",
				required: false,
			},
		},
	},
	/**
	 * A protected resource the AS issues access tokens for.
	 *
	 * Promotes protected resources into a first-class persisted entity with
	 * per-resource token policy. A null value
	 * on any policy column means "inherit the plugin-level default at token
	 * issuance time" — admins can later override without re-seeding.
	 *
	 * @see RFC 8707 (Resource Indicators) — `identifier` is the `resource` parameter value
	 * @see RFC 9068 §2.2 — `customClaims` cannot override reserved JWT claims (enforced server-side)
	 */
	oauthResource: {
		modelName: "oauthResource",
		fields: {
			// Business key used in the `aud` claim and as the RFC 8707 `resource` value.
			identifier: {
				type: "string",
				required: true,
				unique: true,
			},
			// Human-friendly label for admin UIs.
			name: {
				type: "string",
				required: true,
			},
			// Token policy — null means "inherit plugin default at issuance time".
			accessTokenTtl: {
				type: "number",
				required: false,
			},
			refreshTokenTtl: {
				type: "number",
				required: false,
			},
			// Signing — when set, overrides the JWT plugin's getLatestKey() default.
			signingAlgorithm: {
				type: "string",
				required: false,
			},
			signingKeyId: {
				type: "string",
				required: false,
			},
			// Scope allowlist — when non-null, requested scopes must intersect.
			allowedScopes: {
				type: "string[]",
				required: false,
			},
			// Per-resource custom claims. Reserved RFC 9068 claim names are stripped at
			// issuance with a warning log (never silently dropped).
			customClaims: {
				type: "json",
				required: false,
			},
			// Lifecycle: disabled → no new issuance, existing tokens still verify.
			disabled: {
				type: "boolean",
				required: false,
				defaultValue: false,
			},
			createdAt: {
				type: "date",
				required: false,
			},
			updatedAt: {
				type: "date",
				required: false,
			},
			// Forward-migration anchor — lets the runtime branch behavior if claim
			// emission or validation semantics change without forcing every row to
			// migrate. This PR ships with policyVersion = 1.
			policyVersion: {
				type: "number",
				required: false,
				defaultValue: 1,
			},
			// Open-ended extension data for fields not yet promoted to columns
			// (e.g. RFC 9728 non-standard metadata).
			metadata: {
				type: "json",
				required: false,
			},
		},
	},
	/**
	 * Join table — which clients are allowed to request which resources.
	 *
	 * Authoritative only when `enforcePerClientResources: true` on plugin options.
	 * When the flag is off, clients implicitly have access to all enabled resources
	 * (preserves pre-entity behavior).
	 *
	 * Composite uniqueness on `(clientId, resourceId)` is load-bearing — the
	 * `enforcePerClientResources` linkage check assumes one row per pair.
	 *
	 * Better Auth's schema layer doesn't expose composite-UNIQUE syntax (no
	 * way to declare `UNIQUE(clientId, resourceId)` at the column level). To
	 * enforce it at the database level for free, we set the row's `id` to a
	 * deterministic `${clientId}::${resourceId}` value at write time and let
	 * the implicit `UNIQUE` constraint on the primary key catch duplicates
	 * (see `buildClientResourceLinkId` and the `forceAllowId: true` flag on
	 * the `adapter.create` call in `oauthResource/endpoints.ts`). The double
	 * colon separator is chosen because `::` cannot appear in either a
	 * client_id (URL-safe random string) or a resource identifier (RFC 8707
	 * absolute URI — `::` would be an IPv6 form rejected by the validator),
	 * so the encoding is collision-free.
	 *
	 * Concurrent inserts of the same pair surface as a UNIQUE-constraint
	 * error which the endpoint catches and converts to a 200 "alreadyLinked"
	 * response (idempotency).
	 */
	oauthClientResource: {
		modelName: "oauthClientResource",
		fields: {
			clientId: {
				type: "string",
				required: true,
				references: {
					model: "oauthClient",
					field: "clientId",
					onDelete: "cascade",
				},
				index: true,
			},
			resourceId: {
				type: "string",
				required: true,
				references: {
					model: "oauthResource",
					field: "identifier",
					onDelete: "cascade",
				},
				index: true,
			},
			metadata: {
				type: "json",
				required: false,
			},
			createdAt: {
				type: "date",
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
				unique: true,
			},
			clientId: {
				type: "string",
				required: true,
				references: {
					model: "oauthClient",
					field: "clientId",
				},
				index: true,
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
				index: true,
			},
			userId: {
				type: "string",
				required: true,
				references: {
					model: "user",
					field: "id",
				},
				index: true,
			},
			referenceId: {
				type: "string",
				required: false,
			},
			resources: {
				type: "string[]",
				required: false,
			},
			expiresAt: {
				type: "date",
			},
			createdAt: {
				type: "date",
			},
			revoked: {
				type: "date",
				required: false,
			},
			authTime: {
				type: "date",
				required: false,
			},
			// Immutable
			scopes: {
				type: "string[]",
				required: true,
			},
		},
	},
	/**
	 * An opaque access token sent when there is no resource audience claim
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
				index: true,
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
				index: true,
			},
			userId: {
				type: "string",
				required: false,
				references: {
					model: "user",
					field: "id",
				},
				index: true,
			},
			referenceId: {
				type: "string",
				required: false,
			},
			resources: {
				type: "string[]",
				required: false,
			},
			refreshId: {
				type: "string",
				required: false,
				references: {
					model: "oauthRefreshToken",
					field: "id",
				},
				index: true,
			},
			expiresAt: {
				type: "date",
			},
			createdAt: {
				type: "date",
			},
			revoked: {
				type: "date",
				required: false,
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
				required: true,
				references: {
					model: "oauthClient",
					field: "clientId",
				},
				index: true,
			},
			userId: {
				type: "string",
				required: false,
				references: {
					model: "user",
					field: "id",
				},
				index: true,
			},
			referenceId: {
				type: "string",
				required: false,
			},
			resources: {
				type: "string[]",
				required: false,
			},
			scopes: {
				type: "string[]",
				required: true,
			},
			createdAt: {
				type: "date",
			},
			updatedAt: {
				type: "date",
			},
		},
	},
	/**
	 * Single-use record for `private_key_jwt` client assertion `jti` values. The
	 * row id is a digest of the per-client assertion identifier, so a replayed or
	 * concurrent assertion collides on the primary key and the insert fails
	 * atomically on every adapter (SQL primary key, MongoDB `_id`), including
	 * across multiple server processes.
	 *
	 * A row keeps blocking its id until deleted; `expiresAt` marks when removal
	 * is safe, since the assertion it guards has expired and is rejected earlier.
	 * TODO: no scheduled job prunes expired rows yet; like the verification
	 * table, they accumulate until a deployment-level sweep removes them.
	 */
	oauthClientAssertion: {
		modelName: "oauthClientAssertion",
		fields: {
			expiresAt: {
				type: "date",
				required: true,
			},
		},
	},
} satisfies BetterAuthPluginDBSchema;
