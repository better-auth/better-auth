import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";

export const schema = {
	user: {
		fields: {
			phoneNumber: {
				type: "string",
				required: false,
				unique: true,
				sortable: true,
				returned: true,
			},
			phoneNumberVerified: {
				type: "boolean",
				required: false,
				returned: true,
				input: false,
			},
		},
	},
} satisfies BetterAuthPluginDBSchema;
