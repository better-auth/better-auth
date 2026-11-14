/**
 * Deliberate first-party integration surface.
 *
 * This subpath is for Better Auth packages that extend the OAuth provider, such
 * as client discovery and additional grants. Application integrations should
 * use the public endpoints and plugin APIs instead.
 */

export {
	getAcrValuesSupported,
	LEVEL_0_ACR,
} from "./authentication-context";
export {
	type PublicClientJwksValidationResult,
	validatePublicClientJwks,
} from "./client-jwks";
export { isForbiddenCimdClientMetadataField } from "./client-metadata";
export { withExposedHeaders } from "./dpop";
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
	parseScopes,
	tokenError,
	toResourceList,
	validateClientScopes,
} from "./utils";
