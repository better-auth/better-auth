/**
 * Deliberate first-party integration surface.
 *
 * This subpath is for Better Auth packages that extend the OAuth provider, such
 * as client discovery and additional grants. Application integrations should
 * use the public endpoints and plugin APIs instead.
 */

export { getAcrValuesSupported, LEVEL_0_ACR } from "./authentication-context";
export {
	type PublicClientJwksValidationResult,
	validatePublicClientJwks,
} from "./client-jwks";
export { isForbiddenCimdClientMetadataField } from "./client-metadata";
export { withExposedHeaders } from "./dpop";
export { getExtensionClientMetadataFields } from "./extensions";
export { getLocalIntrospection } from "./introspect";
export { getAcceptedIssuers, getDiscoveryIssuer } from "./issuer";
export { createOAuthEndpoint } from "./oauth-endpoint";
export {
	assertPublicRoutableHttpsUri,
	type OAuthClientRegistrationResult,
	type RegisterClientMetadataDocumentInput,
	registerClientMetadataDocument,
	resolveMetadataDocumentClientLists,
} from "./register";
export { resolveResourcePolicy } from "./resources";
export {
	assertConsentStillCovers,
	getAuthEndpointUrl,
	getLocalJwksSource,
	parseClientMetadata,
	parseScopes,
	tokenError,
	toResourceList,
	validateClientScopes,
} from "./utils";
export { getDeliveryTargetRejection } from "./utils/delivery-target";
export {
	isLocalCapacityRefusal,
	isTransientAbort,
	isTransientHttpStatus,
	isTransientNetworkError,
} from "./utils/transient-fetch-failure";
