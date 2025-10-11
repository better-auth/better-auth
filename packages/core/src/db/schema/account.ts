import type { BetterAuthDBSchema } from "..";
import type { DBRequiredTable, InferDBType } from "../type";
import { coreSchema, field, schema } from "./shared";

export const accountSchema = {
	fields: {
		providerId: field("string"),
		accountId: field("string"),
		userId: field("string"),
		accessToken: field("string", { required: false }),
		refreshToken: field("string", { required: false }),
		idToken: field("string", { required: false }),
		/**
		 * Access token expires at
		 */
		accessTokenExpiresAt: field("date", { required: false }),
		/**
		 * Refresh token expires at
		 */
		refreshTokenExpiresAt: field("date", { required: false }),
		/**
		 * The scopes that the user has authorized
		 */
		scope: field("string", { required: false }),
		/**
		 * Password is only stored in the credential provider
		 */
		password: field("string", { required: false }),

		...coreSchema,
	},

	modelName: "account",
};

export type Account<S extends DBRequiredTable<"account"> = typeof schema> =
	InferDBType<S["account"]>;
