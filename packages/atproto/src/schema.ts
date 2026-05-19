import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";

export const schema = {
	user: {
		fields: {
			atprotoDid: {
				type: "string",
				required: false,
				unique: true,
			},
			atprotoHandle: {
				type: "string",
				required: false,
			},
			atprotoBio: {
				type: "string",
				required: false,
			},
			atprotoBanner: {
				type: "string",
				required: false,
			},
		},
	},
	atprotoState: {
		modelName: "atprotoState",
		fields: {
			key: {
				type: "string",
				required: true,
				unique: true,
			},
			state: {
				type: "string",
				required: true,
			},
			expiresAt: {
				type: "date",
				required: true,
			},
		},
	},
	atprotoSession: {
		modelName: "atprotoSession",
		fields: {
			did: {
				type: "string",
				required: true,
				unique: true,
			},
			session: {
				type: "string",
				required: true,
			},
			userId: {
				type: "string",
				required: false,
				references: {
					model: "user",
					field: "id",
					onDelete: "cascade",
				},
			},
			updatedAt: {
				type: "date",
				required: true,
			},
		},
	},
} satisfies BetterAuthPluginDBSchema;
