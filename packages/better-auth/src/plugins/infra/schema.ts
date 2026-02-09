/**
 * Schema definitions for the infra plugin
 */
import type { BetterAuthPlugin } from "better-auth";

/**
 * Get the schema definitions for the infra plugin
 */
export function getInfraSchema() {
	return {
		user: {
			fields: {
				lastActiveAt: {
					type: "date",
					required: false,
				},
			},
		},
		session: {
			fields: {
				city: {
					type: "string",
					required: false,
				},
				country: {
					type: "string",
					required: false,
				},
			},
		},
		bannedUser: {
			fields: {
				userId: {
					type: "string",
					required: true,
					references: {
						model: "user",
						field: "id",
					},
				},
				banReason: {
					type: "string",
					required: false,
				},
				banExpires: {
					type: "number",
					required: false,
				},
				createdAt: {
					type: "date",
					required: true,
					defaultValue: () => new Date(),
				},
				revokedAt: {
					type: "date",
					required: false,
				},
			},
			modelName: "bannedUser",
		},
	} satisfies BetterAuthPlugin["schema"];
}

// Keep getDashSchema as an alias for backward compatibility
export const getDashSchema = getInfraSchema;
