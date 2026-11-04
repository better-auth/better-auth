import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";

export const schema = {
	pin: {
		fields: {
			userId: {
				type: "string",
				required: true,
				unique: true,
				returned: false,
				references: {
					model: "user",
					field: "id",
				},
			},
			hash: {
				type: "string",
				required: true,
				returned: false,
			},
			failedAttempts: {
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
		},
	},
	session: {
		fields: {
			stepUpExpiresAt: {
				type: "date",
				required: false,
				input: false,
				returned: true,
			},
		},
	},
} satisfies BetterAuthPluginDBSchema;

export type PinSchema = typeof schema;
