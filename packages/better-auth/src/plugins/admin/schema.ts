import {
	type BetterAuthPluginDBSchema,
	type DBFieldAttribute,
} from "@better-auth/core/db";
import type { AdminOptions } from "./types";

export const getAdminSchema = <O extends AdminOptions>(opts?: O) => {
	const userFields = {
		role: {
			type: "string",
			required: false,
			input: false,
		},
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
	} satisfies Record<string, DBFieldAttribute>;
	const userSignInTrackingFields = {
		latestSignInAt: {
			type: "date",
			required: false,
			input: false,
		},
	} satisfies Record<string, DBFieldAttribute>;

	return {
		user: {
			fields: {
				...userFields,
				...(opts?.signInTracking ? userSignInTrackingFields : {}),
			} as typeof userFields &
				(O["signInTracking"] extends true
					? typeof userSignInTrackingFields
					: {}),
		},
		session: {
			fields: {
				impersonatedBy: {
					type: "string",
					required: false,
				},
			},
		},
	} as const satisfies BetterAuthPluginDBSchema;
};

export type AdminSchema<O extends AdminOptions> = ReturnType<
	typeof getAdminSchema<O>
>;
