import type { MakeOIDCPlugin } from "./index";
import type { AuthPluginSchema } from "../../types";

export type OIDCSchema = ReturnType<typeof makeSchema>;

export const makeSchema = ({ modelNames }: MakeOIDCPlugin) =>
	({
		[modelNames.oauthClient]: {
			modelName: modelNames.oauthClient,
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
				},
				createdAt: {
					type: "date",
				},
				updatedAt: {
					type: "date",
				},
			},
		},
		[modelNames.oauthAccessToken]: {
			modelName: modelNames.oauthAccessToken,
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
		[modelNames.oauthConsent]: {
			modelName: modelNames.oauthConsent,
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
	}) as AuthPluginSchema;
