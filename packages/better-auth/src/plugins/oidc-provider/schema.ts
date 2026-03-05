import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";
import * as z from "zod";

const oAuthApplicationSchema = z.object({
	/**
	 * Client ID
	 *
	 * size 32
	 *
	 * as described on https://www.rfc-editor.org/rfc/rfc6749.html#section-2.2
	 */
	clientId: z.string(),
	/**
	 * Client Secret
	 *
	 * A secret for the client, if required by the authorization server.
	 * Optional for public clients using PKCE.
	 *
	 * size 32
	 */
	clientSecret: z.string().optional(),
	/**
	 * The client type
	 *
	 * as described on https://www.rfc-editor.org/rfc/rfc6749.html#section-2.1
	 *
	 * - web - A web application
	 * - native - A mobile application
	 * - user-agent-based - A user-agent-based application
	 * - public - A public client (PKCE-enabled, no client_secret)
	 */
	type: z.enum(["web", "native", "user-agent-based", "public"]),
	/**
	 * The name of the client.
	 */
	name: z.string(),
	/**
	 * The icon of the client.
	 */
	icon: z.string().optional(),
	/**
	 * Additional metadata about the client.
	 */
	metadata: z.string().optional(),
	/**
	 * Whether the client is disabled or not.
	 */
	disabled: z.boolean().optional().default(false),

	// Database fields
	redirectUrls: z.string(),
	userId: z.string().optional(),
	createdAt: z.date(),
	updatedAt: z.date(),
});

export type OAuthApplication = z.infer<typeof oAuthApplicationSchema>;

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
