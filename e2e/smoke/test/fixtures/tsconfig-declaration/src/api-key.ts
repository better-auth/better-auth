import { apiKey } from "@better-auth/api-key";
import { betterAuth } from "better-auth";

/**
 * @see https://github.com/better-auth/better-auth/issues/9757
 *
 * Declaration emit must not produce TS4023 for MiddlewareOptions
 * when using the api-key plugin.
 */
export const auth = betterAuth({
	plugins: [apiKey()],
});
