import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";

export const schema = {
	cibaRequest: {
		modelName: "cibaRequest",
		fields: {
			authReqId: {
				type: "string",
				unique: true,
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
			userId: {
				type: "string",
				required: true,
				references: {
					model: "user",
					field: "id",
				},
			},
			scope: {
				type: "string",
				required: true,
			},
			bindingMessage: {
				type: "string",
				required: false,
			},
			authorizationDetails: {
				type: "string",
				required: false,
			},
			resource: {
				type: "string",
				required: false,
			},
			status: {
				type: "string",
				required: true,
			},
			deliveryMode: {
				type: "string",
				required: true,
			},
			clientNotificationToken: {
				type: "string",
				required: false,
			},
			clientNotificationEndpoint: {
				type: "string",
				required: false,
			},
			pollingInterval: {
				type: "number",
				required: true,
			},
			lastPolledAt: {
				type: "number",
				required: false,
			},
			expiresAt: {
				type: "date",
				required: true,
			},
			createdAt: {
				type: "date",
				required: true,
			},
		},
	},
} satisfies BetterAuthPluginDBSchema;
