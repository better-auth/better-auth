/**
 * Deliberate first-party integration surface.
 *
 * This subpath is for Better Auth packages that extend the OAuth provider's
 * verified registration lifecycle. Application integrations should use the
 * public endpoints and plugin APIs instead.
 */

export {
	type PublicClientJwksValidationResult,
	validatePublicClientJwks,
} from "./client-jwks";
export { isForbiddenCimdClientMetadataField } from "./client-metadata";
export { getExtensionClientMetadataFields } from "./extensions";
export { createOAuthEndpoint } from "./oauth-endpoint";
export {
	assertPublicRoutableHttpsUri,
	type OAuthClientRegistrationResult,
	type RegisterClientMetadataDocumentInput,
	registerClientMetadataDocument,
} from "./register";
export { resolveResourcePolicy } from "./resources";
export {
	parseClientMetadata,
	toResourceList,
	validateClientScopes,
} from "./utils";
