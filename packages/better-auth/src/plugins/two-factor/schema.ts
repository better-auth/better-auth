import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";

const timestampFields = {
	createdAt: {
		type: "date",
		required: true,
		defaultValue: () => new Date(),
	},
	updatedAt: {
		type: "date",
		required: true,
		defaultValue: () => new Date(),
		onUpdate: () => new Date(),
	},
} as const;

export const schema = {
	twoFactorMethod: {
		fields: {
			userId: {
				type: "string",
				required: true,
				references: {
					model: "user",
					field: "id",
					onDelete: "cascade",
				},
				index: true,
			},
			kind: {
				type: "string",
				required: true,
				index: true,
			},
			label: {
				type: "string",
				required: false,
			},
			verifiedAt: {
				type: "date",
				required: false,
				index: true,
			},
			lastUsedAt: {
				type: "date",
				required: false,
			},
			...timestampFields,
		},
	},
	twoFactorTotp: {
		fields: {
			methodId: {
				type: "string",
				required: true,
				references: {
					model: "twoFactorMethod",
					field: "id",
					onDelete: "cascade",
				},
				index: true,
				unique: true,
			},
			secret: {
				type: "string",
				required: true,
				returned: false,
			},
			...timestampFields,
		},
	},
	twoFactorRecoveryCode: {
		fields: {
			methodId: {
				type: "string",
				required: true,
				references: {
					model: "twoFactorMethod",
					field: "id",
					onDelete: "cascade",
				},
				index: true,
			},
			codeHash: {
				type: "string",
				required: true,
				returned: false,
				index: true,
			},
			usedAt: {
				type: "date",
				required: false,
			},
			...timestampFields,
		},
	},
	trustedDevice: {
		fields: {
			userId: {
				type: "string",
				required: true,
				references: {
					model: "user",
					field: "id",
					onDelete: "cascade",
				},
				index: true,
			},
			lookupKeyHash: {
				type: "string",
				required: true,
				returned: false,
				unique: true,
			},
			label: {
				type: "string",
				required: false,
			},
			userAgent: {
				type: "string",
				required: false,
			},
			lastUsedAt: {
				type: "date",
				required: false,
			},
			expiresAt: {
				type: "date",
				required: true,
				index: true,
			},
			...timestampFields,
		},
	},
} satisfies BetterAuthPluginDBSchema;
