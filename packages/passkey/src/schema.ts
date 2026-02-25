import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";

export const schema = {
	passkey: {
		fields: {
			name: {
				type: "string",
				required: false,
			},
			publicKey: {
				type: "string",
				required: true,
			},
			userId: {
				type: "string",
				references: {
					model: "user",
					field: "id",
				},
				required: true,
				index: true,
			},
			credentialID: {
				type: "string",
				required: true,
				index: true,
			},
			counter: {
				type: "number",
				required: true,
			},
			deviceType: {
				type: "string",
				required: true,
			},
			backedUp: {
				type: "boolean",
				required: true,
			},
			transports: {
				type: "string",
				required: false,
			},
			createdAt: {
				type: "date",
				required: false,
			},
			aaguid: {
				type: "string",
				required: false,
			},
		},
	},
} satisfies BetterAuthPluginDBSchema;
