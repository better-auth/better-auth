import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";

export const schema = {
	passwordHistory: {
		fields: {
			userId: {
				type: "string",
				required: true,
				returned: false,
				references: {
					model: "user",
					field: "id",
					onDelete: "cascade",
				},
				index: true,
			},
			passwordHash: {
				type: "string",
				required: true,
				returned: false,
			},
			createdAt: {
				type: "date",
				required: true,
				defaultValue: Date,
			},
		},
	},
} satisfies BetterAuthPluginDBSchema;
