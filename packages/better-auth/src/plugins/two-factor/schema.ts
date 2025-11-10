import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";

export const schema = {
	user: {
		fields: {
			twoFactorEnabled: {
				type: "boolean",
				required: false,
				defaultValue: false,
				input: false,
			},
		},
	},
	twoFactor: {
		fields: {
			secret: {
				type: "string",
				required: true,
				returned: false,
				index: true,
			},
			backupCodes: {
				type: "string",
				required: true,
				returned: false,
			},
			userId: {
				type: "string",
				required: true,
				returned: false,
				references: {
					model: "user",
					field: "id",
				},
				index: true,
			},
		},
	},
} satisfies BetterAuthPluginDBSchema;
