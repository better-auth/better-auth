import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";

export const schema = {
	user: {
		fields: {
			banned: {
				type: "boolean",
				defaultValue: false,
				required: false,
				input: false,
			},
			banReason: {
				type: "string",
				required: false,
				input: false,
			},
			banExpires: {
				type: "date",
				required: false,
				input: false,
			},
		},
	},
	session: {
		fields: {
			impersonatedBy: {
				type: "string",
				required: false,
			},
		},
	},
	platformRole: {
		fields: {
			role: {
				type: "string",
				required: true,
			},
			name: {
				type: "string",
				required: true,
			},
			description: {
				type: "string",
				required: true,
			},
			metadata: {
				type: "json",
				required: false,
			},
		},
	},
} satisfies BetterAuthPluginDBSchema;

export type AdminSchema = typeof schema;
