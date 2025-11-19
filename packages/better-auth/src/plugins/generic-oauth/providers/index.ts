/**
 * Provider helpers for generic-oauth plugin
 *
 * These helpers provide pre-configured OAuth provider definitions
 * based on Auth.js/NextAuth.js provider configurations.
 *
 * @example
 * ```ts
 * import { genericOAuth, github, google } from "better-auth/plugins/generic-oauth";
 *
 * export const auth = betterAuth({
 *   plugins: [
 *     genericOAuth({
 *       config: [
 *         github({ clientId, clientSecret }),
 *         google({ clientId, clientSecret }),
 *       ],
 *     }),
 *   ],
 * });
 * ```
 */

export { type GitHubOptions, github } from "./github";
