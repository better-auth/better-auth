/**
 * Provider helpers for generic-oauth plugin
 *
 * These helpers provide pre-configured OAuth provider definitions.
 *
 * @example
 * ```ts
 * import { genericOAuth, okta, auth0, microsoftEntraId, slack, keycloak } from "better-auth/plugins/generic-oauth";
 *
 * export const auth = betterAuth({
 *   plugins: [
 *     genericOAuth({
 *       config: [
 *         okta({ clientId, clientSecret, issuer }),
 *         auth0({ clientId, clientSecret, domain }),
 *         microsoftEntraId({ clientId, clientSecret, tenantId }),
 *         slack({ clientId, clientSecret }),
 *         keycloak({ clientId, clientSecret, issuer }),
 *       ],
 *     }),
 *   ],
 * });
 * ```
 */

export { type OktaOptions, okta } from "./okta";
export { type Auth0Options, auth0 } from "./auth0";
export { type MicrosoftEntraIdOptions, microsoftEntraId } from "./microsoft-entra-id";
export { type SlackOptions, slack } from "./slack";
export { type KeycloakOptions, keycloak } from "./keycloak";
