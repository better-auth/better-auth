/**
 * OIDC Discovery Module
 *
 * This module provides OIDC discovery document fetching, validation, and hydration.
 * It is used both at provider registration time (to persist validated config)
 * and at runtime (to hydrate legacy providers that are missing metadata).
 */

export {
	computeDiscoveryUrl,
	discoverOIDCConfig,
	fetchDiscoveryDocument,
	needsRuntimeDiscovery,
	normalizeDiscoveryUrls,
	normalizeUrl,
	selectTokenEndpointAuthMethod,
	validateDiscoveryDocument,
	validateDiscoveryUrl,
} from "./discovery";

export { mapDiscoveryErrorToAPIError } from "./errors";

export {
	type DiscoverOIDCConfigParams,
	DiscoveryError,
	type DiscoveryErrorCode,
	type HydratedOIDCConfig,
	type OIDCDiscoveryDocument,
	REQUIRED_DISCOVERY_FIELDS,
	type RequiredDiscoveryField,
} from "./types";
