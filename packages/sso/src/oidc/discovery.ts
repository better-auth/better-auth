/**
 * OIDC Discovery Pipeline
 *
 * Implements OIDC discovery document fetching, validation, and hydration.
 * This module is used both at provider registration time (to persist validated config)
 * and at runtime (to hydrate legacy providers that are missing metadata).
 *
 * @see https://openid.net/specs/openid-connect-discovery-1_0.html
 */

import { betterFetch } from "@better-fetch/fetch";
import type {
	DiscoverOIDCConfigParams,
	HydratedOIDCConfig,
	OIDCDiscoveryDocument,
} from "./types";
import { DiscoveryError, REQUIRED_DISCOVERY_FIELDS } from "./types";

/** Default timeout for discovery requests (10 seconds) */
const DEFAULT_DISCOVERY_TIMEOUT = 10000;

/**
 * Main entry point: Discover and hydrate OIDC configuration from an issuer.
 *
 * This function:
 * 1. Computes the discovery URL from the issuer
 * 2. Validates the discovery URL (stub for now)
 * 3. Fetches the discovery document
 * 4. Validates the discovery document (issuer match + required fields)
 * 5. Normalizes URLs (stub for now)
 * 6. Selects token endpoint auth method
 * 7. Merges with existing config (existing values take precedence)
 *
 * @param params - Discovery parameters
 * @returns Hydrated OIDC configuration ready for persistence
 * @throws DiscoveryError on any failure
 */
export async function discoverOIDCConfig(
	params: DiscoverOIDCConfigParams,
): Promise<HydratedOIDCConfig> {
	const {
		issuer,
		existingConfig,
		timeout = DEFAULT_DISCOVERY_TIMEOUT,
	} = params;

	const discoveryUrl =
		params.discoveryEndpoint ||
		existingConfig?.discoveryEndpoint ||
		computeDiscoveryUrl(issuer);

	validateDiscoveryUrl(discoveryUrl);

	const discoveryDoc = await fetchDiscoveryDocument(discoveryUrl, timeout);

	validateDiscoveryDocument(discoveryDoc, issuer);

	const normalizedDoc = normalizeDiscoveryUrls(discoveryDoc, issuer);

	const tokenEndpointAuth = selectTokenEndpointAuthMethod(
		normalizedDoc,
		existingConfig?.tokenEndpointAuthentication,
	);

	const hydratedConfig: HydratedOIDCConfig = {
		issuer: existingConfig?.issuer ?? normalizedDoc.issuer,
		discoveryEndpoint: existingConfig?.discoveryEndpoint ?? discoveryUrl,
		authorizationEndpoint:
			existingConfig?.authorizationEndpoint ??
			normalizedDoc.authorization_endpoint,
		tokenEndpoint:
			existingConfig?.tokenEndpoint ?? normalizedDoc.token_endpoint,
		jwksEndpoint: existingConfig?.jwksEndpoint ?? normalizedDoc.jwks_uri,
		userInfoEndpoint:
			existingConfig?.userInfoEndpoint ?? normalizedDoc.userinfo_endpoint,
		tokenEndpointAuthentication:
			existingConfig?.tokenEndpointAuthentication ?? tokenEndpointAuth,
		scopesSupported:
			existingConfig?.scopesSupported ?? normalizedDoc.scopes_supported,
	};

	return hydratedConfig;
}

/**
 * Compute the discovery URL from an issuer URL.
 *
 * Per OIDC Discovery spec, the discovery document is located at:
 * <issuer>/.well-known/openid-configuration
 *
 * Handles trailing slashes correctly.
 */
export function computeDiscoveryUrl(issuer: string): string {
	const baseUrl = issuer.endsWith("/") ? issuer.slice(0, -1) : issuer;
	return `${baseUrl}/.well-known/openid-configuration`;
}

/**
 * Validate a discovery URL before fetching.
 *
 * @param url - The discovery URL to validate
 * @throws DiscoveryError if URL is invalid
 */
export function validateDiscoveryUrl(url: string): void {
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
			throw new DiscoveryError(
				"discovery_invalid_url",
				`Discovery URL must use HTTP or HTTPS protocol: ${url}`,
				{ url, protocol: parsed.protocol },
			);
		}
	} catch (error) {
		if (error instanceof DiscoveryError) {
			throw error;
		}
		throw new DiscoveryError(
			"discovery_invalid_url",
			`Invalid discovery URL: ${url}`,
			{ url },
			{ cause: error },
		);
	}
}

/**
 * Fetch the OIDC discovery document from the IdP.
 *
 * @param url - The discovery endpoint URL
 * @param timeout - Request timeout in milliseconds
 * @returns The parsed discovery document
 * @throws DiscoveryError on network errors, timeouts, or invalid responses
 */
export async function fetchDiscoveryDocument(
	url: string,
	timeout: number = DEFAULT_DISCOVERY_TIMEOUT,
): Promise<OIDCDiscoveryDocument> {
	try {
		const response = await betterFetch<OIDCDiscoveryDocument>(url, {
			method: "GET",
			timeout,
		});

		if (response.error) {
			const { status } = response.error;

			if (status === 404) {
				throw new DiscoveryError(
					"discovery_not_found",
					"Discovery endpoint not found",
					{
						url,
						status,
					},
				);
			}

			if (status === 408) {
				throw new DiscoveryError(
					"discovery_timeout",
					"Discovery request timed out",
					{
						url,
						timeout,
					},
				);
			}

			throw new DiscoveryError(
				"discovery_unexpected_error",
				`Unexpected discovery error: ${response.error.statusText}`,
				{ url, ...response.error },
			);
		}

		if (!response.data) {
			throw new DiscoveryError(
				"discovery_invalid_json",
				"Discovery endpoint returned an empty response",
				{ url },
			);
		}

		const data = response.data as OIDCDiscoveryDocument | string;
		if (typeof data === "string") {
			throw new DiscoveryError(
				"discovery_invalid_json",
				"Discovery endpoint returned invalid JSON",
				{ url, bodyPreview: data.slice(0, 200) },
			);
		}

		return data;
	} catch (error) {
		if (error instanceof DiscoveryError) {
			throw error;
		}

		// betterFetch throws AbortError on timeout (not returned as response.error)
		// Check error.name since message varies by runtime
		if (error instanceof Error && error.name === "AbortError") {
			throw new DiscoveryError(
				"discovery_timeout",
				"Discovery request timed out",
				{
					url,
					timeout,
				},
			);
		}

		throw new DiscoveryError(
			"discovery_unexpected_error",
			`Unexpected error during discovery: ${error instanceof Error ? error.message : String(error)}`,
			{ url },
			{ cause: error },
		);
	}
}

/**
 * Validate a discovery document.
 *
 * Checks:
 * 1. All required fields are present
 * 2. Issuer matches the configured issuer (case-sensitive, exact match)
 *
 * Invariant: If this function returns without throwing, the document is safe
 * to use for hydrating OIDC config (required fields present, issuer matches
 * configured value, basic structural sanity verified).
 *
 * @param doc - The discovery document to validate
 * @param configuredIssuer - The expected issuer value
 * @throws DiscoveryError if validation fails
 */
export function validateDiscoveryDocument(
	doc: OIDCDiscoveryDocument,
	configuredIssuer: string,
): void {
	const missingFields: string[] = [];

	for (const field of REQUIRED_DISCOVERY_FIELDS) {
		if (!doc[field]) {
			missingFields.push(field);
		}
	}

	if (missingFields.length > 0) {
		throw new DiscoveryError(
			"discovery_incomplete",
			`Discovery document is missing required fields: ${missingFields.join(", ")}`,
			{ missingFields },
		);
	}

	const discoveredIssuer = doc.issuer.endsWith("/")
		? doc.issuer.slice(0, -1)
		: doc.issuer;
	const expectedIssuer = configuredIssuer.endsWith("/")
		? configuredIssuer.slice(0, -1)
		: configuredIssuer;

	if (discoveredIssuer !== expectedIssuer) {
		throw new DiscoveryError(
			"issuer_mismatch",
			`Discovered issuer "${doc.issuer}" does not match configured issuer "${configuredIssuer}"`,
			{
				discovered: doc.issuer,
				configured: configuredIssuer,
			},
		);
	}
}

/**
 * Normalize URLs in the discovery document.
 *
 * @param doc - The discovery document
 * @param _issuerBase - The base issuer URL
 * @returns The normalized discovery document
 */
export function normalizeDiscoveryUrls(
	doc: OIDCDiscoveryDocument,
	_issuerBase: string,
): OIDCDiscoveryDocument {
	return doc;
}

/**
 * Normalize a single URL endpoint.
 *
 * @param endpoint - The endpoint URL to normalize
 * @param _issuerBase - The base issuer URL
 * @returns The normalized endpoint URL
 */
export function normalizeUrl(endpoint: string, _issuerBase: string): string {
	return endpoint;
}

/**
 * Select the token endpoint authentication method.
 *
 * @param doc - The discovery document
 * @param existing - Existing authentication method from config
 * @returns The selected authentication method
 */
export function selectTokenEndpointAuthMethod(
	doc: OIDCDiscoveryDocument,
	existing?: "client_secret_basic" | "client_secret_post",
): "client_secret_basic" | "client_secret_post" {
	if (existing) {
		return existing;
	}

	const supported = doc.token_endpoint_auth_methods_supported;

	if (!supported || supported.length === 0) {
		return "client_secret_basic";
	}

	if (supported.includes("client_secret_basic")) {
		return "client_secret_basic";
	}

	if (supported.includes("client_secret_post")) {
		return "client_secret_post";
	}

	return "client_secret_basic";
}

/**
 * Check if a provider configuration needs runtime discovery.
 *
 * Returns true if we need discovery at runtime to complete the token exchange
 * and validation. Specifically checks for:
 * - `tokenEndpoint` - required for exchanging authorization code for tokens
 * - `jwksEndpoint` - required for validating ID token signatures
 *
 * Note: `authorizationEndpoint` is handled separately in the sign-in flow,
 * so it's not checked here.
 *
 * @param config - Partial OIDC config from the provider
 * @returns true if runtime discovery should be performed
 */
export function needsRuntimeDiscovery(
	config: Partial<HydratedOIDCConfig> | undefined,
): boolean {
	if (!config) {
		return true;
	}

	return !config.tokenEndpoint || !config.jwksEndpoint;
}
