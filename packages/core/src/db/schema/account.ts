import * as z from "zod";
import { coreSchema } from "./shared";

export const accountSchema = coreSchema.extend({
	providerId: z.string(),
	accountId: z.string(),
	userId: z.coerce.string(),
	accessToken: z.string().nullish(),
	refreshToken: z.string().nullish(),
	idToken: z.string().nullish(),
	/**
	 * Access token expires at
	 */
	accessTokenExpiresAt: z.date().nullish(),
	/**
	 * Refresh token expires at
	 */
	refreshTokenExpiresAt: z.date().nullish(),
	/**
	 * The scopes that the user has authorized
	 */
	scope: z.string().nullish(),
	/**
	 * Password is only stored in the credential provider
	 */
	password: z.string().nullish(),
});

/**
 * Account schema type used by better-auth, note that it's possible that account could have additional fields
 *
 * todo: we should use generics to extend this type with additional fields from plugins and options in the future
 */
export type Account = z.infer<typeof accountSchema>;
