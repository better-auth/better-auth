import { apiKey } from "@better-auth/api-key";
import { betterAuth } from "better-auth";

/**
 * @see https://github.com/better-auth/better-auth/issues/9757
 * @see https://github.com/better-auth/better-auth/issues/10710
 *
 * Declaration emit must use the public ApiKeyPlugin type instead of
 * leaking transitive endpoint schema types.
 */
export function initAuth() {
	return betterAuth({
		plugins: [apiKey()],
	});
}
