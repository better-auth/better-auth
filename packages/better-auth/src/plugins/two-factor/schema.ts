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
			verified: {
				type: "boolean",
				required: false,
				// defaults to true so existing rows are treated as verified during migration.
				// new rows from enableTwoFactor explicitly set this to false.
				defaultValue: true,
				input: false,
			},
			failedVerificationCount: {
				type: "number",
				required: false,
				defaultValue: 0,
				input: false,
				returned: false,
			},
			lockedUntil: {
				type: "date",
				required: false,
				input: false,
				returned: false,
			},
			// The most recent TOTP time-step consumed on the step-up
			// (re-verification) path. Step-up verification rejects any candidate
			// step <= this value, enforcing RFC 6238 §5.2 one-time use where the
			// active session leaves no per-challenge row to consume. Nullable so
			// pre-migration rows (and document stores predating the column) are
			// treated as "no step consumed yet" and the first use always succeeds.
			lastUsedStep: {
				type: "number",
				required: false,
				input: false,
				returned: false,
			},
		},
	},
} satisfies BetterAuthPluginDBSchema;
