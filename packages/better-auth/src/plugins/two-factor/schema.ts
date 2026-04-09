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
				required: false,
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
			verified: {
				type: "boolean",
				required: false,
				// defaults to true so pre-migration rows are treated as verified.
				// enableTwoFactor sets: false (TOTP pending), null (OTP-only), true (re-rolling verified TOTP).
				defaultValue: true,
				input: false,
			},
		},
	},
} satisfies BetterAuthPluginDBSchema;
